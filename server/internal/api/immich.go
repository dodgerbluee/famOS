package api

import (
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/sandershome/server/internal/service"
)

type ImmichHandler struct {
	svc *service.ImmichService
}

func NewImmichHandler(svc *service.ImmichService) *ImmichHandler {
	return &ImmichHandler{svc: svc}
}

func (h *ImmichHandler) Test(w http.ResponseWriter, r *http.Request) {
	result := h.svc.TestConnection(r.Context())
	writeJSON(w, http.StatusOK, result)
}

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
	body, contentType, err := h.svc.ProxyAsset(r.Context(), id)
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
