package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/sandershome/server/internal/service"
)

type ChoreTemplatesHandler struct {
	svc *service.ChoreTemplateService
	hub *Hub
}

func NewChoreTemplatesHandler(svc *service.ChoreTemplateService, hub *Hub) *ChoreTemplatesHandler {
	return &ChoreTemplatesHandler{svc: svc, hub: hub}
}

func (h *ChoreTemplatesHandler) List(w http.ResponseWriter, r *http.Request) {
	templates, err := h.svc.ListTemplatesWithStatus(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list chore templates")
		return
	}
	writeJSON(w, http.StatusOK, templates)
}

func (h *ChoreTemplatesHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req service.CreateTemplateRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}
	if len(req.AssignedMembers) == 0 {
		writeError(w, http.StatusBadRequest, "at least one assigned member is required")
		return
	}

	tmpl, err := h.svc.CreateTemplate(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create chore template: "+err.Error())
		return
	}

	h.broadcastTemplates()
	writeJSON(w, http.StatusCreated, tmpl)
}

func (h *ChoreTemplatesHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req service.CreateTemplateRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	tmpl, err := h.svc.UpdateTemplate(r.Context(), id, req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update chore template")
		return
	}

	h.broadcastTemplates()
	writeJSON(w, http.StatusOK, tmpl)
}

func (h *ChoreTemplatesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.svc.DeleteTemplate(id); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete chore template")
		return
	}
	h.broadcastTemplates()
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *ChoreTemplatesHandler) broadcastTemplates() {
	templates, err := h.svc.ListTemplates()
	if err == nil {
		h.hub.Broadcast("chore_templates_updated", templates)
	}
}
