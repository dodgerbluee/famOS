package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/sandershome/server/internal/service"
)

type RewardsHandler struct {
	svc *service.RewardsService
	hub *Hub
}

func NewRewardsHandler(svc *service.RewardsService, hub *Hub) *RewardsHandler {
	return &RewardsHandler{svc: svc, hub: hub}
}

func (h *RewardsHandler) ListRewards(w http.ResponseWriter, r *http.Request) {
	activeOnly := r.URL.Query().Get("active") == "true"
	rewards, err := h.svc.ListRewards(activeOnly)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list rewards")
		return
	}
	if rewards == nil {
		rewards = []service.Reward{}
	}
	writeJSON(w, http.StatusOK, rewards)
}

func (h *RewardsHandler) CreateReward(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Cost        int    `json:"cost"`
		ImageURL    string `json:"imageUrl"`
		Category    string `json:"category"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" || req.Cost <= 0 {
		writeError(w, http.StatusBadRequest, "name and positive cost are required")
		return
	}

	reward, err := h.svc.CreateReward(req.Name, req.Description, req.Cost, req.ImageURL, req.Category)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create reward")
		return
	}

	h.hub.Broadcast("reward_created", reward)
	writeJSON(w, http.StatusCreated, reward)
}

func (h *RewardsHandler) UpdateReward(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		Cost        *int    `json:"cost"`
		ImageURL    *string `json:"imageUrl"`
		Category    *string `json:"category"`
		Active      *bool   `json:"active"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.svc.UpdateReward(id, req.Name, req.Description, req.Cost, req.ImageURL, req.Category, req.Active); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update reward")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *RewardsHandler) DeleteReward(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.svc.DeleteReward(id); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete reward")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *RewardsHandler) RequestRedemption(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RewardID string `json:"rewardId"`
		MemberID string `json:"memberId"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	redemption, err := h.svc.RequestRedemption(req.RewardID, req.MemberID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.hub.Broadcast("redemption_requested", redemption)
	writeJSON(w, http.StatusCreated, redemption)
}

func (h *RewardsHandler) ResolveRedemption(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		Status     string `json:"status"`
		ResolvedBy string `json:"resolvedBy"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.svc.ResolveRedemption(id, req.ResolvedBy, req.Status); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.hub.Broadcast("redemption_resolved", map[string]string{"id": id, "status": req.Status})
	writeJSON(w, http.StatusOK, map[string]string{"status": req.Status})
}

func (h *RewardsHandler) ListRedemptions(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	redemptions, err := h.svc.ListRedemptions(status)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list redemptions")
		return
	}
	if redemptions == nil {
		redemptions = []service.RedemptionWithDetails{}
	}
	writeJSON(w, http.StatusOK, redemptions)
}
