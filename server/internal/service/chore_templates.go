package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

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
	loc     *time.Location
}

func NewChoreTemplateService(database *db.DB, vikunja VikunjaClient, locations ...*time.Location) *ChoreTemplateService {
	loc := time.Local
	if len(locations) > 0 && locations[0] != nil {
		loc = locations[0]
	}
	return &ChoreTemplateService{db: database, vikunja: vikunja, loc: loc}
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
	IsAdHoc         bool           `json:"isAdHoc,omitempty"`
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
	now := time.Now().In(s.loc)
	dueDate := time.Date(now.Year(), now.Month(), now.Day(), 23, 59, 59, 0, s.loc).Format(time.RFC3339)

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
			DueDate:     dueDate,
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
	now := time.Now().In(s.loc)

	var result []ChoreTemplateWithStatus
	for _, tmpl := range templates {
		tws := ChoreTemplateWithStatus{
			ChoreTemplate: tmpl,
			Tasks:         []MemberTaskStatus{},
		}
		activeMembers := []string{}

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

			for _, task := range s.loadProjectTasks(ctx, projectTasks, projectID) {
				if taskHasLabel(task, tmpl.VikunjaLabel) && taskVisibleOnChores(task, now, s.loc) {
					tws.Tasks = append(tws.Tasks, MemberTaskStatus{
						MemberID:      memberID,
						VikunjaTaskID: task.ID,
						Done:          task.Done,
					})
					activeMembers = append(activeMembers, memberID)
					break
				}
			}
		}

		if len(tws.Tasks) > 0 {
			tws.AssignedMembers = activeMembers
			tws.IsShared = len(activeMembers) > 1
			result = append(result, tws)
		}
	}

	adHoc, err := s.adHocKidTasks(ctx, projectTasks, now)
	if err != nil {
		return nil, err
	}
	result = append(result, adHoc...)

	if result == nil {
		result = []ChoreTemplateWithStatus{}
	}
	return result, nil
}

func (s *ChoreTemplateService) loadProjectTasks(ctx context.Context, cache map[int64][]VikunjaTask, projectID int64) []VikunjaTask {
	if projectID == 0 {
		return nil
	}
	if tasks, ok := cache[projectID]; ok {
		return tasks
	}
	tasks, err := s.vikunja.GetTasksForProject(ctx, projectID)
	if err != nil {
		tasks = []VikunjaTask{}
	}
	cache[projectID] = tasks
	return tasks
}

func (s *ChoreTemplateService) adHocKidTasks(ctx context.Context, projectTasks map[int64][]VikunjaTask, now time.Time) ([]ChoreTemplateWithStatus, error) {
	rows, err := s.db.Query(`
		SELECT id, COALESCE(vikunja_project_id, 0)
		FROM family_members
		WHERE role = 'kid'
	`)
	if err != nil {
		return nil, err
	}

	type kidProject struct {
		memberID  string
		projectID int64
	}
	var kids []kidProject
	for rows.Next() {
		var kp kidProject
		if err := rows.Scan(&kp.memberID, &kp.projectID); err != nil {
			rows.Close()
			return nil, err
		}
		kids = append(kids, kp)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}

	var result []ChoreTemplateWithStatus
	for _, kid := range kids {
		for _, task := range s.loadProjectTasks(ctx, projectTasks, kid.projectID) {
			if taskHasTemplateLabel(task) || !taskVisibleOnChores(task, now, s.loc) {
				continue
			}
			result = append(result, ChoreTemplateWithStatus{
				ChoreTemplate: ChoreTemplate{
					ID:              fmt.Sprintf("vikunja:%d", task.ID),
					Title:           task.Title,
					Icon:            "📋",
					AssignedMembers: []string{kid.memberID},
					Active:          true,
					CreatedAt:       task.CreatedAt,
					IsAdHoc:         true,
				},
				Tasks: []MemberTaskStatus{{
					MemberID:      kid.memberID,
					VikunjaTaskID: task.ID,
					Done:          task.Done,
				}},
			})
		}
	}
	return result, nil
}

// Chores appear only when their due day arrives. A missed chore remains visible
// through the 3 AM grace period and then disappears because it can no longer be
// completed. Undated legacy chores stay visible for backward compatibility.
func taskVisibleOnChores(task VikunjaTask, now time.Time, loc *time.Location) bool {
	if task.DueDate == "" {
		return true
	}
	due, err := time.Parse(time.RFC3339, task.DueDate)
	if err != nil {
		return true
	}
	localDue := due.In(loc)
	dueDay := time.Date(localDue.Year(), localDue.Month(), localDue.Day(), 0, 0, 0, 0, loc)
	deadline := dueDay.AddDate(0, 0, 1).Add(3 * time.Hour)
	localNow := now.In(loc)
	return !localNow.Before(dueDay) && !localNow.After(deadline)
}

func taskHasLabel(task VikunjaTask, label string) bool {
	for _, l := range task.Labels {
		if l == label {
			return true
		}
	}
	return false
}

func taskHasTemplateLabel(task VikunjaTask) bool {
	for _, l := range task.Labels {
		if strings.HasPrefix(l, "template:") {
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

	type tmplRow struct {
		id          string
		membersJSON string
	}
	var found []tmplRow
	for rows.Next() {
		var row tmplRow
		if rows.Scan(&row.id, &row.membersJSON) != nil {
			continue
		}
		found = append(found, row)
	}
	rows.Close()

	for _, row := range found {
		var members []string
		json.Unmarshal([]byte(row.membersJSON), &members)
		var updated []string
		for _, m := range members {
			if m != memberID {
				updated = append(updated, m)
			}
		}
		if len(updated) == 0 {
			s.db.Exec(`UPDATE chore_templates SET active = FALSE WHERE id = ?`, row.id)
		} else {
			newJSON, _ := json.Marshal(updated)
			isShared := len(updated) > 1
			s.db.Exec(`UPDATE chore_templates SET assigned_members = ?, is_shared = ? WHERE id = ?`, string(newJSON), isShared, row.id)
		}
	}
	return nil
}
