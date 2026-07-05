package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/sandershome/server/internal/service"
)

type ChoresHandler struct {
	svc *service.ChoresService
	hub *Hub
}

func NewChoresHandler(svc *service.ChoresService, hub *Hub) *ChoresHandler {
	return &ChoresHandler{svc: svc, hub: hub}
}

func (h *ChoresHandler) List(w http.ResponseWriter, r *http.Request) {
	chores, err := h.svc.ListChores()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list chores")
		return
	}
	writeJSON(w, http.StatusOK, chores)
}

func (h *ChoresHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req service.CreateChoreRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}

	chore, err := h.svc.CreateChore(req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create chore")
		return
	}

	h.broadcastChores()
	writeJSON(w, http.StatusCreated, chore)
}

func (h *ChoresHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req service.CreateChoreRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.svc.UpdateChore(id, req); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update chore")
		return
	}

	h.broadcastChores()
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *ChoresHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.svc.DeleteChore(id); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete chore")
		return
	}
	h.broadcastChores()
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *ChoresHandler) Complete(w http.ResponseWriter, r *http.Request) {
	choreID := chi.URLParam(r, "id")
	var req struct {
		CompletedBy string `json:"completedBy"`
	}
	if err := readJSON(r, &req); err != nil || req.CompletedBy == "" {
		writeError(w, http.StatusBadRequest, "completedBy is required")
		return
	}

	completion, err := h.svc.CompleteChore(choreID, req.CompletedBy)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to complete chore")
		return
	}
	if completion == nil {
		writeError(w, http.StatusConflict, "already completed today")
		return
	}

	h.broadcastChores()
	writeJSON(w, http.StatusOK, completion)
}

func (h *ChoresHandler) Uncomplete(w http.ResponseWriter, r *http.Request) {
	choreID := chi.URLParam(r, "id")
	var req struct {
		MemberID string `json:"memberId"`
	}
	if err := readJSON(r, &req); err != nil || req.MemberID == "" {
		writeError(w, http.StatusBadRequest, "memberId is required")
		return
	}

	if err := h.svc.UncompleteChore(choreID, req.MemberID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to uncomplete chore")
		return
	}

	h.broadcastChores()
	writeJSON(w, http.StatusOK, map[string]string{"status": "uncompleted"})
}

func (h *ChoresHandler) broadcastChores() {
	chores, err := h.svc.ListChores()
	if err == nil {
		h.hub.Broadcast("chores_updated", chores)
	}
}
