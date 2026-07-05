package api

import (
	"net/http"

	"github.com/sandershome/server/internal/service"
)

type GatusHandler struct {
	svc *service.GatusService
}

func NewGatusHandler(svc *service.GatusService) *GatusHandler {
	return &GatusHandler{svc: svc}
}

func (h *GatusHandler) GetStatus(w http.ResponseWriter, r *http.Request) {
	status, err := h.svc.GetStatus(r.Context())
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, status)
}
