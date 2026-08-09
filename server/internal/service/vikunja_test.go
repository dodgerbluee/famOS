package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/sandershome/server/internal/db"
)

func setupVikunjaTest(t *testing.T, handler http.Handler) (*VikunjaService, *httptest.Server) {
	t.Helper()
	ts := httptest.NewServer(handler)

	database, err := db.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Migrate(); err != nil {
		t.Fatal(err)
	}

	database.Exec(`INSERT INTO app_settings (key, value) VALUES ('vikunja_url', ?)`, `"`+ts.URL+`"`)
	database.Exec(`INSERT INTO app_settings (key, value) VALUES ('vikunja_api_key', ?)`, `"test-api-key"`)

	svc := NewVikunjaService(database)
	t.Cleanup(func() {
		ts.Close()
		database.Close()
	})
	return svc, ts
}

func TestCreateProject(t *testing.T) {
	var receivedBody map[string]interface{}
	var receivedAuth string

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut || r.URL.Path != "/api/v1/projects" {
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
			return
		}
		receivedAuth = r.Header.Get("Authorization")
		json.NewDecoder(r.Body).Decode(&receivedBody)
		json.NewEncoder(w).Encode(map[string]interface{}{"id": 42, "title": receivedBody["title"]})
	})

	svc, _ := setupVikunjaTest(t, handler)

	projectID, err := svc.CreateProject(context.Background(), "Greg", 10)
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	if projectID != 42 {
		t.Errorf("expected project ID 42, got %d", projectID)
	}
	if receivedAuth != "Bearer test-api-key" {
		t.Errorf("expected Bearer auth header, got %q", receivedAuth)
	}
	if receivedBody["title"] != "Greg" {
		t.Errorf("expected title 'Greg', got %v", receivedBody["title"])
	}
	if receivedBody["parent_project_id"] != float64(10) {
		t.Errorf("expected parent_project_id 10, got %v", receivedBody["parent_project_id"])
	}
}

func TestDeleteProject(t *testing.T) {
	var receivedMethod, receivedPath, receivedAuth string

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedMethod = r.Method
		receivedPath = r.URL.Path
		receivedAuth = r.Header.Get("Authorization")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "success"})
	})

	svc, _ := setupVikunjaTest(t, handler)

	err := svc.DeleteProject(context.Background(), 42)
	if err != nil {
		t.Fatalf("DeleteProject returned error: %v", err)
	}
	if receivedMethod != http.MethodDelete {
		t.Errorf("expected DELETE, got %s", receivedMethod)
	}
	if receivedPath != "/api/v1/projects/42" {
		t.Errorf("expected path /api/v1/projects/42, got %s", receivedPath)
	}
	if receivedAuth != "Bearer test-api-key" {
		t.Errorf("expected Bearer auth header, got %q", receivedAuth)
	}
}

func TestCreateTask(t *testing.T) {
	var receivedBody map[string]any
	var receivedPath string

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedPath = r.URL.Path
		json.NewDecoder(r.Body).Decode(&receivedBody)
		json.NewEncoder(w).Encode(map[string]any{"id": 99})
	})

	svc, _ := setupVikunjaTest(t, handler)

	taskID, err := svc.CreateTask(context.Background(), CreateTaskParams{
		ProjectID:   42,
		Title:       "Make your bed",
		RepeatAfter: 86400,
		Labels:      []string{"template:abc123"},
	})
	if err != nil {
		t.Fatalf("CreateTask returned error: %v", err)
	}
	if taskID != 99 {
		t.Errorf("expected task ID 99, got %d", taskID)
	}
	if receivedPath != "/api/v1/projects/42/tasks" {
		t.Errorf("expected path /api/v1/projects/42/tasks, got %s", receivedPath)
	}
	if receivedBody["title"] != "Make your bed" {
		t.Errorf("expected title 'Make your bed', got %v", receivedBody["title"])
	}
	if receivedBody["repeat_after"] != float64(86400) {
		t.Errorf("expected repeat_after 86400, got %v", receivedBody["repeat_after"])
	}
	labels, ok := receivedBody["labels"].([]any)
	if !ok || len(labels) != 1 {
		t.Fatalf("expected 1 label, got %v", receivedBody["labels"])
	}
	labelMap, ok := labels[0].(map[string]any)
	if !ok || labelMap["title"] != "template:abc123" {
		t.Errorf("expected label title 'template:abc123', got %v", labels[0])
	}
}

func TestDeleteTask(t *testing.T) {
	var receivedMethod, receivedPath string

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedMethod = r.Method
		receivedPath = r.URL.Path
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "success"})
	})

	svc, _ := setupVikunjaTest(t, handler)

	err := svc.DeleteTask(context.Background(), 99)
	if err != nil {
		t.Fatalf("DeleteTask returned error: %v", err)
	}
	if receivedMethod != http.MethodDelete {
		t.Errorf("expected DELETE, got %s", receivedMethod)
	}
	if receivedPath != "/api/v1/tasks/99" {
		t.Errorf("expected path /api/v1/tasks/99, got %s", receivedPath)
	}
}

func TestGetCompletedTasks(t *testing.T) {
	var receivedPath, receivedQuery string

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedPath = r.URL.Path
		receivedQuery = r.URL.RawQuery
		tasks := []map[string]any{
			{
				"id": 10, "title": "Make your bed", "done": true,
				"done_at": "2026-08-08T10:00:00Z", "project_id": 42,
				"labels": []map[string]any{{"title": "template:abc123"}},
			},
			{
				"id": 11, "title": "Undone task", "done": false,
				"project_id": 42, "labels": []map[string]any{},
			},
		}
		json.NewEncoder(w).Encode(tasks)
	})

	svc, _ := setupVikunjaTest(t, handler)

	tasks, err := svc.GetCompletedTasks(context.Background(), 42)
	if err != nil {
		t.Fatalf("GetCompletedTasks returned error: %v", err)
	}
	if receivedPath != "/api/v1/projects/42/tasks" {
		t.Errorf("expected path /api/v1/projects/42/tasks, got %s", receivedPath)
	}
	if receivedQuery == "" {
		t.Error("expected query params for filtering done tasks")
	}
	if len(tasks) != 1 {
		t.Fatalf("expected 1 completed task, got %d", len(tasks))
	}
	if tasks[0].ID != 10 {
		t.Errorf("expected task ID 10, got %d", tasks[0].ID)
	}
	if tasks[0].Title != "Make your bed" {
		t.Errorf("expected title 'Make your bed', got %s", tasks[0].Title)
	}
	if len(tasks[0].Labels) != 1 || tasks[0].Labels[0] != "template:abc123" {
		t.Errorf("expected label 'template:abc123', got %v", tasks[0].Labels)
	}
}
