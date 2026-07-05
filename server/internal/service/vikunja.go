package service

import (
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
	ID          int64  `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
	Done        bool   `json:"done"`
	Priority    int    `json:"priority"`
	DueDate     string `json:"dueDate,omitempty"`
	CreatedAt   string `json:"createdAt,omitempty"`
	ProjectID   int64  `json:"projectId"`
	ProjectName string `json:"projectName,omitempty"`
	BucketID    int64  `json:"bucketId,omitempty"`
}

type VikunjaStatus struct {
	Total      int           `json:"total"`
	Overdue    int           `json:"overdue"`
	DueToday   int           `json:"dueToday"`
	HighPrio   int           `json:"highPrio"`
	Tasks      []VikunjaTask `json:"tasks"`
}

func (s *VikunjaService) config() (string, string) {
	var rawURL, rawKey string
	s.db.QueryRow(`SELECT value FROM app_settings WHERE key = 'vikunja_url'`).Scan(&rawURL)
	s.db.QueryRow(`SELECT value FROM app_settings WHERE key = 'vikunja_api_key'`).Scan(&rawKey)

	var url, key string
	json.Unmarshal([]byte(rawURL), &url)
	json.Unmarshal([]byte(rawKey), &key)
	return strings.TrimRight(url, "/"), key
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

	now := time.Now()
	todayEnd := time.Date(now.Year(), now.Month(), now.Day(), 23, 59, 59, 0, now.Location())

	status := &VikunjaStatus{}
	for i := range tasks {
		if tasks[i].Done {
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
