package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/sandershome/server/internal/api"
	"github.com/sandershome/server/internal/background"
	"github.com/sandershome/server/internal/config"
	"github.com/sandershome/server/internal/db"
	"github.com/sandershome/server/internal/frigate"
	"github.com/sandershome/server/internal/service"
)

func main() {
	cfg := config.Load()

	database, err := db.New(cfg.DatabasePath)
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	defer database.Close()

	if err := database.Migrate(); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	hub := api.NewHub()
	go hub.Run()

	svc := api.NewServices(database, cfg)

	applyFrigateSettings(database, svc.Frigate, cfg)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	batchSvc := service.NewBatchService(database)
	scheduler := background.NewScheduler(svc.Calendar, svc.Weather, svc.Cash, svc.AI, batchSvc, database, hub.Broadcast, cfg.Timezone)

	router := api.NewRouter(database, cfg, svc, hub, batchSvc, scheduler)

	scheduler.Start(ctx)

	mqttConfig := getMQTTConfig(database, cfg)
	if mqttConfig != nil {
		mqttSub := frigate.NewMQTTSubscriber(*mqttConfig, func(alert frigate.MotionAlert) {
			if !shouldBroadcastMotionAlert(database, alert) {
				return
			}
			log.Printf("motion alert: %s detected on %s", alert.Label, alert.Camera)
			hub.Broadcast("motion_alert", alert)
		})
		mqttSub.Start()
		defer mqttSub.Stop()
	}

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("SandersHome API listening on :%d", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("shutting down server...")
	cancel()
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("server forced shutdown: %v", err)
	}
	log.Println("server stopped")
}

func getSetting(database *db.DB, key string) string {
	var raw string
	err := database.QueryRow("SELECT value FROM app_settings WHERE key = ?", key).Scan(&raw)
	if err != nil {
		return ""
	}
	var s string
	if err := json.Unmarshal([]byte(raw), &s); err != nil {
		return raw
	}
	return s
}

func applyFrigateSettings(database *db.DB, client *frigate.Client, cfg *config.Config) {
	url := getSetting(database, "frigate_url")
	user := getSetting(database, "frigate_username")
	pass := getSetting(database, "frigate_password")

	if url == "" {
		url = cfg.FrigateURL
	}
	client.Configure(url, user, pass)
	if url != "" {
		log.Printf("Frigate configured: %s (auth: %v)", url, user != "")
	}
}

func getMQTTConfig(database *db.DB, cfg *config.Config) *frigate.MQTTConfig {
	host := getSetting(database, "mqtt_host")
	if host == "" {
		legacyBroker := getSetting(database, "mqtt_broker")
		if legacyBroker != "" {
			host, _ = config.ParseLegacyMQTTBroker(legacyBroker)
		}
	}
	if host == "" {
		host = cfg.MQTTHost
	}
	if host == "" {
		return nil
	}

	port := cfg.MQTTPort
	if rawPort := getSetting(database, "mqtt_port"); rawPort != "" {
		if parsed, err := strconv.Atoi(rawPort); err == nil && parsed > 0 {
			port = parsed
		}
	} else if legacyBroker := getSetting(database, "mqtt_broker"); legacyBroker != "" {
		_, parsedPort := config.ParseLegacyMQTTBroker(legacyBroker)
		port = parsedPort
	}

	baseTopic := getSetting(database, "mqtt_base_topic")
	if baseTopic == "" {
		baseTopic = cfg.MQTTBaseTopic
	}
	clientID := getSetting(database, "mqtt_client_id")
	if clientID == "" {
		clientID = cfg.MQTTClientID
	}

	return &frigate.MQTTConfig{
		Host:      host,
		Port:      port,
		Username:  firstNonEmpty(getSetting(database, "mqtt_username"), cfg.MQTTUsername),
		Password:  firstNonEmpty(getSetting(database, "mqtt_password"), cfg.MQTTPassword),
		ClientID:  clientID,
		BaseTopic: baseTopic,
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func shouldBroadcastMotionAlert(database *db.DB, alert frigate.MotionAlert) bool {
	labels := splitSettingList(getSetting(database, "motion_alert_labels"))
	if len(labels) > 0 && !containsIgnoreCase(labels, alert.Label) {
		return false
	}

	cameras := splitSettingList(getSetting(database, "motion_alert_cameras"))
	if len(cameras) > 0 && !containsIgnoreCase(cameras, alert.Camera) {
		return false
	}

	return true
}

func splitSettingList(raw string) []string {
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	items := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			items = append(items, trimmed)
		}
	}
	return items
}

func containsIgnoreCase(values []string, target string) bool {
	for _, value := range values {
		if strings.EqualFold(value, target) {
			return true
		}
	}
	return false
}
