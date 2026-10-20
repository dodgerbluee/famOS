package api

import (
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/sandershome/server/internal/service"
)

const immichKeyMask = "••••••••"

type ImmichHandler struct {
	svc *service.ImmichService
}

func NewImmichHandler(svc *service.ImmichService) *ImmichHandler {
	return &ImmichHandler{svc: svc}
}

// ── Screensaver feed + asset proxy ──

func (h *ImmichHandler) GetAlbum(w http.ResponseWriter, r *http.Request) {
	photos, err := h.svc.GetAlbumPhotos(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, photos)
}

func (h *ImmichHandler) ProxyAsset(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	sourceID := r.URL.Query().Get("source")
	size := r.URL.Query().Get("size")
	body, contentType, err := h.svc.ProxyAsset(r.Context(), sourceID, id, size)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	defer body.Close()

	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	w.Header().Set("Cache-Control", "public, max-age=86400")
	io.Copy(w, body)
}

// ── Source CRUD ──

func (h *ImmichHandler) ListSources(w http.ResponseWriter, r *http.Request) {
	sources, err := h.svc.ListSources()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	for i := range sources {
		if sources[i].APIKey != "" {
			sources[i].APIKey = immichKeyMask
		}
	}
	writeJSON(w, http.StatusOK, sources)
}

type immichSourceReq struct {
	Name    string `json:"name"`
	URL     string `json:"url"`
	APIKey  string `json:"apiKey"`
	AlbumID string `json:"albumId"`
	Enabled *bool  `json:"enabled"`
}

func (h *ImmichHandler) CreateSource(w http.ResponseWriter, r *http.Request) {
	var req immichSourceReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if strings.TrimSpace(req.URL) == "" {
		writeError(w, http.StatusBadRequest, "url is required")
		return
	}
	if req.Name == "" {
		req.Name = "Immich Album"
	}

	id := uuid.NewString()
	enabled := 1
	if req.Enabled != nil && !*req.Enabled {
		enabled = 0
	}
	_, err := h.svc.CreateSource(id, req.Name, req.URL, req.APIKey, req.AlbumID, enabled == 1)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.svc.InvalidateCache()
	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

func (h *ImmichHandler) UpdateSource(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req immichSourceReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.URL != "" && strings.TrimSpace(req.URL) == "" {
		writeError(w, http.StatusBadRequest, "url cannot be blank")
		return
	}

	// Preserve the stored key when the client echoes back the masked value.
	apiKey := req.APIKey
	if apiKey == immichKeyMask {
		apiKey = ""
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	_, err := h.svc.UpdateSource(id, req.Name, req.URL, apiKey, req.AlbumID, req.Enabled != nil, enabled)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.svc.InvalidateCache()
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *ImmichHandler) DeleteSource(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.svc.DeleteSource(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.svc.InvalidateCache()
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ── Connection tests ──

func (h *ImmichHandler) TestSource(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	result := h.svc.TestSource(r.Context(), id)
	writeJSON(w, http.StatusOK, result)
}

func (h *ImmichHandler) TestConfig(w http.ResponseWriter, r *http.Request) {
	var req struct {
		URL     string `json:"url"`
		APIKey  string `json:"apiKey"`
		AlbumID string `json:"albumId"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	result := h.svc.TestConfig(r.Context(), req.URL, req.APIKey, req.AlbumID)
	writeJSON(w, http.StatusOK, result)
}
