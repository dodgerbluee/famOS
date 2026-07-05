package config

import (
	"net/url"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Port          int
	DatabasePath  string
	SessionSecret string

	// AI
	AIProvider  string
	OllamaURL   string
	OllamaModel string

	// Frigate
	FrigateURL          string
	MQTTBroker          string
	MQTTHost            string
	MQTTPort            int
	MQTTUsername        string
	MQTTPassword        string
	MQTTDiscoveryPrefix string
	MQTTBaseTopic       string
	MQTTClientID        string

	// Home Assistant
	HAURL   string
	HAToken string

	// Weather
	LocationLat float64
	LocationLon float64

	// Frontend
	FrontendURL string
	Timezone    string
}

func Load() *Config {
	legacyBroker := envStr("MQTT_BROKER", "tcp://localhost:1883")
	mqttHost, mqttPort := ParseLegacyMQTTBroker(legacyBroker)
	timezone := envTimezone("TZ", "UTC")

	return &Config{
		Port:          envInt("PORT", 8080),
		DatabasePath:  envStr("DATABASE_PATH", "./data/sandershome.db"),
		SessionSecret: envStr("SESSION_SECRET", "change-me-in-production"),

		AIProvider:  envStr("AI_PROVIDER", "ollama"),
		OllamaURL:   envStr("OLLAMA_URL", "http://localhost:11434"),
		OllamaModel: envStr("OLLAMA_MODEL", "llama3.1"),

		FrigateURL:          envStr("FRIGATE_URL", "http://localhost:5000"),
		MQTTBroker:          legacyBroker,
		MQTTHost:            envStr("MQTT_HOST", mqttHost),
		MQTTPort:            envInt("MQTT_PORT", mqttPort),
		MQTTUsername:        envStr("MQTT_USERNAME", ""),
		MQTTPassword:        envStr("MQTT_PASSWORD", ""),
		MQTTDiscoveryPrefix: envStr("MQTT_DISCOVERY_PREFIX", "homeassistant"),
		MQTTBaseTopic:       envStr("MQTT_BASE_TOPIC", "frigate"),
		MQTTClientID:        envStr("MQTT_CLIENT_ID", "sandershome"),

		HAURL:   envStr("HA_URL", "http://localhost:8123"),
		HAToken: envStr("HA_TOKEN", ""),

		LocationLat: envFloat("LOCATION_LAT", 0),
		LocationLon: envFloat("LOCATION_LON", 0),

		FrontendURL: envStr("FRONTEND_URL", "http://localhost:5173"),
		Timezone:    timezone,
	}
}

func ParseLegacyMQTTBroker(raw string) (string, int) {
	if raw == "" {
		return "localhost", 1883
	}

	u, err := url.Parse(raw)
	if err != nil {
		return "localhost", 1883
	}

	host := u.Hostname()
	if host == "" {
		host = "localhost"
	}

	port := 1883
	if p := u.Port(); p != "" {
		if n, err := strconv.Atoi(p); err == nil {
			port = n
		}
	}

	return host, port
}

func envStr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}

func envFloat(key string, fallback float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return fallback
}

func envTimezone(key, fallback string) string {
	value := envStr(key, fallback)
	if _, err := time.LoadLocation(value); err == nil {
		return value
	}
	return fallback
}
