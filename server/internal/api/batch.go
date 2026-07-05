package api

import (
	"context"
	"net/http"

	"github.com/sandershome/server/internal/background"
	"github.com/sandershome/server/internal/service"
)

type BatchHandler struct {
	batch     *service.BatchService
	scheduler *background.Scheduler
}

func NewBatchHandler(batch *service.BatchService, scheduler *background.Scheduler) *BatchHandler {
	return &BatchHandler{batch: batch, scheduler: scheduler}
}

func (h *BatchHandler) ListRuns(w http.ResponseWriter, r *http.Request) {
	runs, err := h.batch.ListRuns(100)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, runs)
}

func (h *BatchHandler) TriggerBriefing(w http.ResponseWriter, r *http.Request) {
	go h.scheduler.GenerateBriefingNow(context.Background())
	writeJSON(w, http.StatusOK, map[string]string{"status": "started"})
}
