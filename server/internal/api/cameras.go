package api

import (
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/sandershome/server/internal/frigate"
)

type CamerasHandler struct {
	client *frigate.Client
	hub    *Hub
}

func NewCamerasHandler(client *frigate.Client, hub *Hub) *CamerasHandler {
	return &CamerasHandler{client: client, hub: hub}
}

func (h *CamerasHandler) OpenFrigate(w http.ResponseWriter, r *http.Request) {
	baseURL := h.client.BaseURL()
	if baseURL == "" {
		writeError(w, http.StatusBadGateway, "Frigate is not configured")
		return
	}

	if err := h.client.Login(r.Context()); err != nil {
		log.Printf("frigate open: login failed: %v", err)
	}

	http.Redirect(w, r, baseURL, http.StatusFound)
}

func (h *CamerasHandler) ListCameras(w http.ResponseWriter, r *http.Request) {
	cameras, err := h.client.ListCameras(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, "failed to reach Frigate: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, cameras)
}

func (h *CamerasHandler) GetSnapshot(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	data, contentType, err := h.client.GetSnapshot(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusBadGateway, "snapshot error: "+err.Error())
		return
	}
	if contentType == "" {
		contentType = "image/jpeg"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "no-cache")
	w.Write(data)
}

func (h *CamerasHandler) GetEventThumbnail(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "eventId")
	data, contentType, err := h.client.GetEventThumbnail(r.Context(), eventID)
	if err != nil {
		writeError(w, http.StatusBadGateway, "thumbnail error: "+err.Error())
		return
	}
	if contentType == "" {
		contentType = "image/jpeg"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "max-age=3600")
	w.Write(data)
}

func (h *CamerasHandler) ListEvents(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 20
	}
	events, err := h.client.ListEvents(r.Context(), limit)
	if err != nil {
		writeError(w, http.StatusBadGateway, "events error: "+err.Error())
		return
	}
	if events == nil {
		events = []frigate.Event{}
	}
	writeJSON(w, http.StatusOK, events)
}

func (h *CamerasHandler) GetStatus(w http.ResponseWriter, r *http.Request) {
	available := h.client.Available(r.Context())
	writeJSON(w, http.StatusOK, map[string]bool{"available": available})
}
