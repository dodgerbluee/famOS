package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/sandershome/server/internal/db"
)

type VikunjaService struct {
	db     *db.DB
	client *http.Client
}

func NewVikunjaService(database *db.DB) *VikunjaService {
	return &VikunjaService{
		db:     database,
		client: &http.Client{Timeout: 15 * time.Second},
	}
}

type VikunjaTask struct {
	ID          int64    `json:"id"`
	Title       string   `json:"title"`
	Description string   `json:"description,omitempty"`
	Done        bool     `json:"done"`
	Priority    int      `json:"priority"`
	DueDate     string   `json:"dueDate,omitempty"`
	CreatedAt   string   `json:"createdAt,omitempty"`
	ProjectID   int64    `json:"projectId"`
	ProjectName string   `json:"projectName,omitempty"`
	BucketID    int64    `json:"bucketId,omitempty"`
	Labels      []string `json:"labels,omitempty"`
}

type VikunjaStatus struct {
	Total    int           `json:"total"`
	Overdue  int           `json:"overdue"`
	DueToday int           `json:"dueToday"`
	HighPrio int           `json:"highPrio"`
	Tasks    []VikunjaTask `json:"tasks"`
}

func (s *VikunjaService) configOrErr() (string, string, error) {
	var rawURL, rawKey string
	s.db.QueryRow(`SELECT value FROM app_settings WHERE key = 'vikunja_url'`).Scan(&rawURL)
	s.db.QueryRow(`SELECT value FROM app_settings WHERE key = 'vikunja_api_key'`).Scan(&rawKey)

	var url, key string
	json.Unmarshal([]byte(rawURL), &url)
	json.Unmarshal([]byte(rawKey), &key)
	url = strings.TrimRight(url, "/")

	if url == "" {
		return "", "", fmt.Errorf("Vikunja URL not configured")
	}
	if key == "" {
		return "", "", fmt.Errorf("Vikunja API key not configured")
	}
	return url, key, nil
}

func (s *VikunjaService) config() (string, string) {
	url, key, _ := s.configOrErr()
	return url, key
}

func (s *VikunjaService) doRequest(ctx context.Context, method, path string, body any) (*http.Response, error) {
	baseURL, apiKey, err := s.configOrErr()
	if err != nil {
		return nil, err
	}

	var bodyReader io.Reader
	if body != nil {
		bodyJSON, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyReader = bytes.NewReader(bodyJSON)
	}

	req, err := http.NewRequestWithContext(ctx, method, baseURL+path, bodyReader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	return s.client.Do(req)
}

func (s *VikunjaService) excludedProjects() map[int64]bool {
	var raw string
	s.db.QueryRow(`SELECT value FROM app_settings WHERE key = 'vikunja_excluded_projects'`).Scan(&raw)
	var ids []int64
	json.Unmarshal([]byte(raw), &ids)
	m := make(map[int64]bool, len(ids))
	for _, id := range ids {
		m[id] = true
	}
	return m
}

func (s *VikunjaService) GetTasks(ctx context.Context) (*VikunjaStatus, error) {
	baseURL, apiKey := s.config()
	if baseURL == "" {
		return nil, fmt.Errorf("Vikunja URL not configured")
	}
	if apiKey == "" {
		return nil, fmt.Errorf("Vikunja API key not configured")
	}

	tasks, err := s.fetchTasks(ctx, baseURL, apiKey)
	if err != nil {
		return nil, err
	}

	projects, _ := s.fetchProjects(ctx, baseURL, apiKey)
	projectMap := make(map[int64]string)
	for _, p := range projects {
		projectMap[p.ID] = p.Title
	}

	excluded := s.excludedProjects()

	now := time.Now()
	todayEnd := time.Date(now.Year(), now.Month(), now.Day(), 23, 59, 59, 0, now.Location())

	status := &VikunjaStatus{}
	for i := range tasks {
		if tasks[i].Done {
			continue
		}
		if excluded[tasks[i].ProjectID] {
			continue
		}
		if name, ok := projectMap[tasks[i].ProjectID]; ok {
			tasks[i].ProjectName = name
		}

		status.Total++
		if tasks[i].Priority >= 3 {
			status.HighPrio++
		}
		if tasks[i].DueDate != "" {
			due, err := time.Parse(time.RFC3339, tasks[i].DueDate)
			if err == nil {
				if due.Before(now) {
					status.Overdue++
				} else if due.Before(todayEnd) {
					status.DueToday++
				}
			}
		}
		status.Tasks = append(status.Tasks, tasks[i])
	}

	if status.Tasks == nil {
		status.Tasks = []VikunjaTask{}
	}
	return status, nil
}

type VikunjaProject struct {
	ID    int64  `json:"id"`
	Title string `json:"title"`
}

func (s *VikunjaService) GetProjects(ctx context.Context) ([]VikunjaProject, error) {
	baseURL, apiKey := s.config()
	if baseURL == "" {
		return nil, fmt.Errorf("Vikunja URL not configured")
	}
	if apiKey == "" {
		return nil, fmt.Errorf("Vikunja API key not configured")
	}
	internal, err := s.fetchProjects(ctx, baseURL, apiKey)
	if err != nil {
		return nil, err
	}
	out := make([]VikunjaProject, len(internal))
	for i, p := range internal {
		out[i] = VikunjaProject{ID: p.ID, Title: p.Title}
	}
	return out, nil
}

type vikunjaAPITask struct {
	ID          int64  `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Done        bool   `json:"done"`
	Priority    int    `json:"priority"`
	DueDate     string `json:"due_date"`
	ProjectID   int64  `json:"project_id"`
	BucketID    int64  `json:"bucket_id"`
	CreatedAt   string `json:"created"`
}

type vikunjaProject struct {
	ID    int64  `json:"id"`
	Title string `json:"title"`
}

func (s *VikunjaService) fetchTasks(ctx context.Context, baseURL, apiKey string) ([]VikunjaTask, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/api/v1/tasks?per_page=50", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("vikunja fetch failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("vikunja returned %d: %s", resp.StatusCode, string(body))
	}

	var apiTasks []vikunjaAPITask
	if err := json.NewDecoder(resp.Body).Decode(&apiTasks); err != nil {
		return nil, fmt.Errorf("decode vikunja tasks: %w", err)
	}

	tasks := make([]VikunjaTask, 0, len(apiTasks))
	for _, t := range apiTasks {
		task := VikunjaTask{
			ID:          t.ID,
			Title:       t.Title,
			Description: t.Description,
			Done:        t.Done,
			Priority:    t.Priority,
			ProjectID:   t.ProjectID,
			BucketID:    t.BucketID,
			CreatedAt:   t.CreatedAt,
		}
		if t.DueDate != "" && t.DueDate != "0001-01-01T00:00:00Z" {
			task.DueDate = t.DueDate
		}
		tasks = append(tasks, task)
	}
	return tasks, nil
}

func (s *VikunjaService) fetchProjects(ctx context.Context, baseURL, apiKey string) ([]vikunjaProject, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/api/v1/projects", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("vikunja projects returned %d", resp.StatusCode)
	}

	var projects []vikunjaProject
	json.NewDecoder(resp.Body).Decode(&projects)
	return projects, nil
}

func (s *VikunjaService) CreateProject(ctx context.Context, title string, parentProjectID int64) (int64, error) {
	resp, err := s.doRequest(ctx, http.MethodPut, "/api/v1/projects", map[string]any{
		"title":             title,
		"parent_project_id": parentProjectID,
	})
	if err != nil {
		return 0, fmt.Errorf("vikunja create project failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(resp.Body)
		return 0, fmt.Errorf("vikunja create project returned %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, fmt.Errorf("decode vikunja project response: %w", err)
	}
	return result.ID, nil
}

func (s *VikunjaService) DeleteProject(ctx context.Context, projectID int64) error {
	resp, err := s.doRequest(ctx, http.MethodDelete, fmt.Sprintf("/api/v1/projects/%d", projectID), nil)
	if err != nil {
		return fmt.Errorf("vikunja delete project failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("vikunja delete project returned %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}

type CreateTaskParams struct {
	ProjectID   int64
	Title       string
	DueDate     string
	RepeatAfter int64
	Labels      []string
}

func (s *VikunjaService) CreateTask(ctx context.Context, params CreateTaskParams) (int64, error) {
	labels := make([]map[string]string, len(params.Labels))
	for i, l := range params.Labels {
		labels[i] = map[string]string{"title": l}
	}

	body := map[string]any{
		"title":        params.Title,
		"repeat_after": params.RepeatAfter,
		"labels":       labels,
	}
	if params.DueDate != "" {
		body["due_date"] = params.DueDate
	}

	resp, err := s.doRequest(ctx, http.MethodPut, fmt.Sprintf("/api/v1/projects/%d/tasks", params.ProjectID), body)
	if err != nil {
		return 0, fmt.Errorf("vikunja create task failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(resp.Body)
		return 0, fmt.Errorf("vikunja create task returned %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		ID int64 `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, fmt.Errorf("decode vikunja task response: %w", err)
	}
	return result.ID, nil
}

func (s *VikunjaService) DeleteTask(ctx context.Context, taskID int64) error {
	resp, err := s.doRequest(ctx, http.MethodDelete, fmt.Sprintf("/api/v1/tasks/%d", taskID), nil)
	if err != nil {
		return fmt.Errorf("vikunja delete task failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("vikunja delete task returned %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}

type CompletedTask struct {
	ID        int64    `json:"id"`
	Title     string   `json:"title"`
	DoneAt    string   `json:"doneAt"`
	ProjectID int64    `json:"projectId"`
	Labels    []string `json:"labels"`
}

func (s *VikunjaService) GetCompletedTasks(ctx context.Context, projectID int64) ([]CompletedTask, error) {
	resp, err := s.doRequest(ctx, http.MethodGet, fmt.Sprintf("/api/v1/projects/%d/tasks?filter_done=true&per_page=50", projectID), nil)
	if err != nil {
		return nil, fmt.Errorf("vikunja fetch completed tasks failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("vikunja completed tasks returned %d: %s", resp.StatusCode, string(respBody))
	}

	var apiTasks []struct {
		ID        int64  `json:"id"`
		Title     string `json:"title"`
		Done      bool   `json:"done"`
		DoneAt    string `json:"done_at"`
		ProjectID int64  `json:"project_id"`
		Labels    []struct {
			Title string `json:"title"`
		} `json:"labels"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&apiTasks); err != nil {
		return nil, fmt.Errorf("decode vikunja completed tasks: %w", err)
	}

	var tasks []CompletedTask
	for _, t := range apiTasks {
		if !t.Done {
			continue
		}
		ct := CompletedTask{
			ID:        t.ID,
			Title:     t.Title,
			DoneAt:    t.DoneAt,
			ProjectID: t.ProjectID,
		}
		for _, l := range t.Labels {
			ct.Labels = append(ct.Labels, l.Title)
		}
		tasks = append(tasks, ct)
	}
	return tasks, nil
}

func (s *VikunjaService) SetTaskDone(ctx context.Context, taskID int64, done bool) error {
	resp, err := s.doRequest(ctx, http.MethodPost, fmt.Sprintf("/api/v1/tasks/%d", taskID), map[string]any{"done": done})
	if err != nil {
		return fmt.Errorf("vikunja set task done failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("vikunja set task done returned %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}

func (s *VikunjaService) CompleteTask(ctx context.Context, taskID int64) error {
	return s.SetTaskDone(ctx, taskID, true)
}

func (s *VikunjaService) UncompleteTask(ctx context.Context, taskID int64) error {
	return s.SetTaskDone(ctx, taskID, false)
}

type vikunjaAPITaskWithLabels struct {
	vikunjaAPITask
	Labels []struct {
		Title string `json:"title"`
	} `json:"labels"`
}

func (s *VikunjaService) GetTasksForProject(ctx context.Context, projectID int64) ([]VikunjaTask, error) {
	resp, err := s.doRequest(ctx, http.MethodGet, fmt.Sprintf("/api/v1/projects/%d/tasks?per_page=50", projectID), nil)
	if err != nil {
		return nil, fmt.Errorf("vikunja fetch project tasks failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("vikunja project tasks returned %d: %s", resp.StatusCode, string(respBody))
	}

	var apiTasks []vikunjaAPITaskWithLabels
	if err := json.NewDecoder(resp.Body).Decode(&apiTasks); err != nil {
		return nil, fmt.Errorf("decode vikunja project tasks: %w", err)
	}

	tasks := make([]VikunjaTask, 0, len(apiTasks))
	for _, t := range apiTasks {
		task := VikunjaTask{
			ID:        t.ID,
			Title:     t.Title,
			Done:      t.Done,
			Priority:  t.Priority,
			ProjectID: t.ProjectID,
			CreatedAt: t.CreatedAt,
		}
		if t.DueDate != "" && t.DueDate != "0001-01-01T00:00:00Z" {
			task.DueDate = t.DueDate
		}
		for _, l := range t.Labels {
			task.Labels = append(task.Labels, l.Title)
		}
		tasks = append(tasks, task)
	}
	return tasks, nil
}

func (s *VikunjaService) GetTaskLabels(ctx context.Context, projectID int64) (map[int64][]string, error) {
	resp, err := s.doRequest(ctx, http.MethodGet, fmt.Sprintf("/api/v1/projects/%d/tasks?per_page=50", projectID), nil)
	if err != nil {
		return nil, fmt.Errorf("vikunja fetch project tasks failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("vikunja project tasks returned %d: %s", resp.StatusCode, string(respBody))
	}

	var apiTasks []vikunjaAPITaskWithLabels
	if err := json.NewDecoder(resp.Body).Decode(&apiTasks); err != nil {
		return nil, fmt.Errorf("decode vikunja project tasks: %w", err)
	}

	result := make(map[int64][]string, len(apiTasks))
	for _, t := range apiTasks {
		var labels []string
		for _, l := range t.Labels {
			labels = append(labels, l.Title)
		}
		result[t.ID] = labels
	}
	return result, nil
}
