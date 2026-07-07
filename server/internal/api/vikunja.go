package api

import (
	"net/http"

	"github.com/sandershome/server/internal/service"
)

type VikunjaHandler struct {
	svc *service.VikunjaService
}

func NewVikunjaHandler(svc *service.VikunjaService) *VikunjaHandler {
	return &VikunjaHandler{svc: svc}
}

func (h *VikunjaHandler) GetTasks(w http.ResponseWriter, r *http.Request) {
	status, err := h.svc.GetTasks(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func (h *VikunjaHandler) GetProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := h.svc.GetProjects(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, projects)
}
