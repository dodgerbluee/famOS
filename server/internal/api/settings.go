package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/sandershome/server/internal/db"
	"github.com/sandershome/server/internal/frigate"
)

type SettingsHandler struct {
	db      *db.DB
	frigate *frigate.Client
}

func (h *SettingsHandler) Get(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query("SELECT key, value FROM app_settings")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	settings := map[string]string{}
	for rows.Next() {
		var key, raw string
		if err := rows.Scan(&key, &raw); err != nil {
			continue
		}
		var s string
		if err := json.Unmarshal([]byte(raw), &s); err != nil {
			s = raw
		}
		if (key == "frigate_password" || key == "mqtt_password") && s != "" {
			s = "********"
		}
		settings[key] = s
	}
	writeJSON(w, http.StatusOK, settings)
}

func (h *SettingsHandler) Update(w http.ResponseWriter, r *http.Request) {
	var updates map[string]string
	if err := readJSON(r, &updates); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	tx, err := h.db.Begin()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()

	for key, value := range updates {
		if (key == "frigate_password" || key == "mqtt_password") && value == "********" {
			continue
		}
		encoded, _ := json.Marshal(value)
		_, err := tx.Exec(
			"INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
			key, string(encoded),
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.reloadFrigate()

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *SettingsHandler) TestMQTT(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Host     string `json:"host"`
		Port     string `json:"port"`
		Username string `json:"username"`
		Password string `json:"password"`
		ClientID string `json:"clientId"`
	}
	if err := readJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if payload.Host == "" {
		writeError(w, http.StatusBadRequest, "MQTT host is required")
		return
	}

	port := 1883
	if payload.Port != "" {
		parsed, err := strconv.Atoi(payload.Port)
		if err != nil || parsed <= 0 {
			writeError(w, http.StatusBadRequest, "MQTT port must be a valid number")
			return
		}
		port = parsed
	}

	clientID := payload.ClientID
	if clientID == "" {
		clientID = "sandershome-test"
		if time.Now().UnixNano() != 0 {
			clientID = clientID + "-" + strconv.FormatInt(time.Now().UnixNano(), 10)
		}
	}

	opts := mqtt.NewClientOptions().
		AddBroker("tcp://" + payload.Host + ":" + strconv.Itoa(port)).
		SetClientID(clientID).
		SetConnectTimeout(5 * time.Second)
	if payload.Username != "" {
		opts.SetUsername(payload.Username)
		opts.SetPassword(payload.Password)
	}

	client := mqtt.NewClient(opts)
	token := client.Connect()
	if !token.WaitTimeout(6 * time.Second) {
		writeError(w, http.StatusGatewayTimeout, "MQTT connection timed out")
		return
	}
	if err := token.Error(); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	client.Disconnect(250)

	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "msg": "Connected successfully"})
}

func (h *SettingsHandler) reloadFrigate() {
	if h.frigate == nil {
		return
	}
	url := h.getSetting("frigate_url")
	user := h.getSetting("frigate_username")
	pass := h.getSetting("frigate_password")
	if pass == "********" {
		pass = ""
	}
	h.frigate.Configure(url, user, pass)
}

func (h *SettingsHandler) getSetting(key string) string {
	var raw string
	err := h.db.QueryRow("SELECT value FROM app_settings WHERE key = ?", key).Scan(&raw)
	if err != nil {
		return ""
	}
	var s string
	if err := json.Unmarshal([]byte(raw), &s); err != nil {
		return raw
	}
	return s
}
