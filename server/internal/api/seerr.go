package api

import (
	"net/http"

	"github.com/sandershome/server/internal/service"
)

type SeerrHandler struct {
	svc *service.SeerrService
}

func NewSeerrHandler(svc *service.SeerrService) *SeerrHandler {
	return &SeerrHandler{svc: svc}
}

func (h *SeerrHandler) GetRequests(w http.ResponseWriter, r *http.Request) {
	status, err := h.svc.GetRequests(r.Context())
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, status)
}
