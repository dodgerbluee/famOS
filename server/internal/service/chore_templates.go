package service

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/google/uuid"
	"github.com/sandershome/server/internal/db"
)

type VikunjaClient interface {
	CreateTask(ctx context.Context, params CreateTaskParams) (int64, error)
	DeleteTask(ctx context.Context, taskID int64) error
	GetTasksForProject(ctx context.Context, projectID int64) ([]VikunjaTask, error)
}

type ChoreTemplateService struct {
	db      *db.DB
	vikunja VikunjaClient
}

func NewChoreTemplateService(database *db.DB, vikunja VikunjaClient) *ChoreTemplateService {
	return &ChoreTemplateService{db: database, vikunja: vikunja}
}

type TemplateTask struct {
	MemberID      string `json:"memberId"`
	VikunjaTaskID int64  `json:"vikunjaTaskId"`
	Done          bool   `json:"done"`
}

type ChoreTemplate struct {
	ID              string         `json:"id"`
	Title           string         `json:"title"`
	Icon            string         `json:"icon"`
	Recurrence      string         `json:"recurrence"`
	RewardAmount    int            `json:"rewardAmount"`
	IsShared        bool           `json:"isShared"`
	AssignedMembers []string       `json:"assignedMembers"`
	VikunjaLabel    string         `json:"vikunjaLabel"`
	Active          bool           `json:"active"`
	CreatedAt       string         `json:"createdAt"`
	Tasks           []TemplateTask `json:"tasks,omitempty"`
}

type MemberTaskStatus struct {
	MemberID      string `json:"memberId"`
	VikunjaTaskID int64  `json:"vikunjaTaskId"`
	Done          bool   `json:"done"`
}

type ChoreTemplateWithStatus struct {
	ChoreTemplate
	Tasks []MemberTaskStatus `json:"tasks"`
}

type CreateTemplateRequest struct {
	Title           string   `json:"title"`
	Icon            string   `json:"icon"`
	Recurrence      string   `json:"recurrence"`
	RewardAmount    int      `json:"rewardAmount"`
	AssignedMembers []string `json:"assignedMembers"`
}

func recurrenceToRepeatAfter(recurrence string) int64 {
	switch recurrence {
	case "daily":
		return 86400
	case "weekly":
		return 604800
	default:
		return 0
	}
}

func (s *ChoreTemplateService) CreateTemplate(ctx context.Context, req CreateTemplateRequest) (*ChoreTemplate, error) {
	id := uuid.New().String()
	label := fmt.Sprintf("template:%s", id)
	isShared := len(req.AssignedMembers) > 1

	if req.Recurrence == "" {
		req.Recurrence = "daily"
	}

	membersJSON, err := json.Marshal(req.AssignedMembers)
	if err != nil {
		return nil, err
	}

	_, err = s.db.Exec(`
		INSERT INTO chore_templates (id, title, icon, recurrence, reward_amount, is_shared, assigned_members, vikunja_label)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, id, req.Title, req.Icon, req.Recurrence, req.RewardAmount, isShared, string(membersJSON), label)
	if err != nil {
		return nil, fmt.Errorf("insert chore template: %w", err)
	}

	repeatAfter := recurrenceToRepeatAfter(req.Recurrence)

	for _, memberID := range req.AssignedMembers {
		var projectID int64
		err := s.db.QueryRow(`SELECT vikunja_project_id FROM family_members WHERE id = ?`, memberID).Scan(&projectID)
		if err != nil {
			return nil, fmt.Errorf("lookup vikunja project for member %s: %w", memberID, err)
		}

		labels := []string{label}
		if isShared {
			labels = append(labels, "shared")
		}

		_, err = s.vikunja.CreateTask(ctx, CreateTaskParams{
			ProjectID:   projectID,
			Title:       req.Title,
			RepeatAfter: repeatAfter,
			Labels:      labels,
		})
		if err != nil {
			return nil, fmt.Errorf("create vikunja task for member %s: %w", memberID, err)
		}
	}

	return &ChoreTemplate{
		ID:              id,
		Title:           req.Title,
		Icon:            req.Icon,
		Recurrence:      req.Recurrence,
		RewardAmount:    req.RewardAmount,
		IsShared:        isShared,
		AssignedMembers: req.AssignedMembers,
		VikunjaLabel:    label,
		Active:          true,
	}, nil
}

func (s *ChoreTemplateService) ListTemplates() ([]ChoreTemplate, error) {
	rows, err := s.db.Query(`
		SELECT id, title, icon, recurrence, reward_amount, is_shared, assigned_members, vikunja_label, active, created_at
		FROM chore_templates WHERE active = TRUE ORDER BY created_at
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var templates []ChoreTemplate
	for rows.Next() {
		var t ChoreTemplate
		var membersJSON string
		if err := rows.Scan(&t.ID, &t.Title, &t.Icon, &t.Recurrence, &t.RewardAmount, &t.IsShared, &membersJSON, &t.VikunjaLabel, &t.Active, &t.CreatedAt); err != nil {
			return nil, err
		}
		json.Unmarshal([]byte(membersJSON), &t.AssignedMembers)
		if t.AssignedMembers == nil {
			t.AssignedMembers = []string{}
		}
		templates = append(templates, t)
	}
	if templates == nil {
		templates = []ChoreTemplate{}
	}
	return templates, nil
}

func (s *ChoreTemplateService) ListTemplatesWithStatus(ctx context.Context) ([]ChoreTemplateWithStatus, error) {
	templates, err := s.ListTemplates()
	if err != nil {
		return nil, err
	}

	memberProjects := make(map[string]int64)
	projectTasks := make(map[int64][]VikunjaTask)

	var result []ChoreTemplateWithStatus
	for _, tmpl := range templates {
		tws := ChoreTemplateWithStatus{
			ChoreTemplate: tmpl,
			Tasks:         []MemberTaskStatus{},
		}

		for _, memberID := range tmpl.AssignedMembers {
			if _, ok := memberProjects[memberID]; !ok {
				var pid int64
				s.db.QueryRow(`SELECT vikunja_project_id FROM family_members WHERE id = ?`, memberID).Scan(&pid)
				memberProjects[memberID] = pid
			}
			projectID := memberProjects[memberID]
			if projectID == 0 {
				continue
			}

			if _, ok := projectTasks[projectID]; !ok {
				tasks, err := s.vikunja.GetTasksForProject(ctx, projectID)
				if err != nil {
					projectTasks[projectID] = []VikunjaTask{}
				} else {
					projectTasks[projectID] = tasks
				}
			}

			for _, task := range projectTasks[projectID] {
				if taskHasLabel(task, tmpl.VikunjaLabel) {
					tws.Tasks = append(tws.Tasks, MemberTaskStatus{
						MemberID:      memberID,
						VikunjaTaskID: task.ID,
						Done:          task.Done,
					})
					break
				}
			}
		}

		result = append(result, tws)
	}
	if result == nil {
		result = []ChoreTemplateWithStatus{}
	}
	return result, nil
}

func taskHasLabel(task VikunjaTask, label string) bool {
	for _, l := range task.Labels {
		if l == label {
			return true
		}
	}
	return false
}

func (s *ChoreTemplateService) UpdateTemplate(ctx context.Context, id string, req CreateTemplateRequest) (*ChoreTemplate, error) {
	isShared := len(req.AssignedMembers) > 1
	if req.Recurrence == "" {
		req.Recurrence = "daily"
	}

	membersJSON, err := json.Marshal(req.AssignedMembers)
	if err != nil {
		return nil, err
	}

	_, err = s.db.Exec(`
		UPDATE chore_templates SET title = ?, icon = ?, recurrence = ?, reward_amount = ?, is_shared = ?, assigned_members = ?
		WHERE id = ?
	`, req.Title, req.Icon, req.Recurrence, req.RewardAmount, isShared, string(membersJSON), id)
	if err != nil {
		return nil, fmt.Errorf("update chore template: %w", err)
	}

	var label, createdAt string
	s.db.QueryRow(`SELECT vikunja_label, created_at FROM chore_templates WHERE id = ?`, id).Scan(&label, &createdAt)

	return &ChoreTemplate{
		ID:              id,
		Title:           req.Title,
		Icon:            req.Icon,
		Recurrence:      req.Recurrence,
		RewardAmount:    req.RewardAmount,
		IsShared:        isShared,
		AssignedMembers: req.AssignedMembers,
		VikunjaLabel:    label,
		Active:          true,
		CreatedAt:       createdAt,
	}, nil
}

func (s *ChoreTemplateService) DeleteTemplate(id string) error {
	_, err := s.db.Exec(`UPDATE chore_templates SET active = FALSE WHERE id = ?`, id)
	return err
}

func (s *ChoreTemplateService) RemoveMemberFromTemplates(memberID string) error {
	rows, err := s.db.Query(`SELECT id, assigned_members FROM chore_templates WHERE active = TRUE AND assigned_members LIKE ?`, "%"+memberID+"%")
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var tmplID, membersJSON string
		if rows.Scan(&tmplID, &membersJSON) != nil {
			continue
		}
		var members []string
		json.Unmarshal([]byte(membersJSON), &members)
		var updated []string
		for _, m := range members {
			if m != memberID {
				updated = append(updated, m)
			}
		}
		if len(updated) == 0 {
			s.db.Exec(`UPDATE chore_templates SET active = FALSE WHERE id = ?`, tmplID)
		} else {
			newJSON, _ := json.Marshal(updated)
			isShared := len(updated) > 1
			s.db.Exec(`UPDATE chore_templates SET assigned_members = ?, is_shared = ? WHERE id = ?`, string(newJSON), isShared, tmplID)
		}
	}
	return nil
}
