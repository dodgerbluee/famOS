package api

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/sandershome/server/internal/auth"
	"github.com/sandershome/server/internal/db"
	"github.com/sandershome/server/internal/service"
)

type TasksHandler struct {
	vikunja *service.VikunjaService
	db      *db.DB
}

func NewTasksHandler(vikunja *service.VikunjaService, database *db.DB) *TasksHandler {
	return &TasksHandler{vikunja: vikunja, db: database}
}

func (h *TasksHandler) ListMyTasks(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var projectID int64
	err := h.db.QueryRow(`SELECT vikunja_project_id FROM family_members WHERE id = ?`, user.MemberID).Scan(&projectID)
	if err != nil || projectID == 0 {
		writeJSON(w, http.StatusOK, []any{})
		return
	}

	tasks, err := h.vikunja.GetTasksForProject(r.Context(), projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch tasks")
		return
	}
	if tasks == nil {
		tasks = []service.VikunjaTask{}
	}
	writeJSON(w, http.StatusOK, tasks)
}

func (h *TasksHandler) Create(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var req struct {
		Title   string `json:"title"`
		DueDate string `json:"dueDate"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}

	var projectID int64
	err := h.db.QueryRow(`SELECT vikunja_project_id FROM family_members WHERE id = ?`, user.MemberID).Scan(&projectID)
	if err != nil || projectID == 0 {
		writeError(w, http.StatusBadRequest, "no Vikunja project configured for your account")
		return
	}

	taskID, err := h.vikunja.CreateTask(r.Context(), service.CreateTaskParams{
		ProjectID: projectID,
		Title:     req.Title,
		DueDate:   req.DueDate,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create task: "+err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, map[string]int64{"id": taskID})
}

func (h *TasksHandler) Complete(w http.ResponseWriter, r *http.Request) {
	taskIDStr := chi.URLParam(r, "taskId")
	taskID, err := strconv.ParseInt(taskIDStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid task ID")
		return
	}

	if err := h.vikunja.CompleteTask(r.Context(), taskID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to complete task")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "completed"})
}

func (h *TasksHandler) Uncomplete(w http.ResponseWriter, r *http.Request) {
	taskIDStr := chi.URLParam(r, "taskId")
	taskID, err := strconv.ParseInt(taskIDStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid task ID")
		return
	}

	if err := h.vikunja.UncompleteTask(r.Context(), taskID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to uncomplete task")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "uncompleted"})
}
