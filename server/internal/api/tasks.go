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
	projectID, ok := h.projectForRequest(w, r, r.URL.Query().Get("memberId"))
	if !ok {
		return
	}
	if projectID == 0 {
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

func (h *TasksHandler) projectForRequest(w http.ResponseWriter, r *http.Request, memberID string) (int64, bool) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return 0, false
	}
	if memberID == "" {
		memberID = user.MemberID
	}

	var projectID int64
	var role string
	err := h.db.QueryRow(`SELECT COALESCE(vikunja_project_id, 0), role FROM family_members WHERE id = ?`, memberID).Scan(&projectID, &role)
	if err != nil {
		writeError(w, http.StatusNotFound, "family member not found")
		return 0, false
	}
	if role == "kiosk" {
		writeError(w, http.StatusBadRequest, "kiosks do not have tasks")
		return 0, false
	}
	return projectID, true
}

func (h *TasksHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Title    string `json:"title"`
		DueDate  string `json:"dueDate"`
		MemberID string `json:"memberId"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}

	projectID, ok := h.projectForRequest(w, r, req.MemberID)
	if !ok {
		return
	}
	if projectID == 0 {
		writeError(w, http.StatusBadRequest, "no Vikunja project configured for this member")
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
