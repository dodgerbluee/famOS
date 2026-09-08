package service

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/sandershome/server/internal/db"
)

type mockVikunjaClient struct {
	createdTasks []CreateTaskParams
	nextTaskID   int64
	projectTasks map[int64][]VikunjaTask
}

func (m *mockVikunjaClient) CreateTask(ctx context.Context, params CreateTaskParams) (int64, error) {
	m.createdTasks = append(m.createdTasks, params)
	m.nextTaskID++
	return m.nextTaskID, nil
}

func (m *mockVikunjaClient) DeleteTask(ctx context.Context, taskID int64) error {
	return nil
}

func (m *mockVikunjaClient) GetTasksForProject(ctx context.Context, projectID int64) ([]VikunjaTask, error) {
	if m.projectTasks == nil {
		return []VikunjaTask{}, nil
	}
	return m.projectTasks[projectID], nil
}

func setupTemplateTest(t *testing.T) (*ChoreTemplateService, *mockVikunjaClient, *db.DB) {
	t.Helper()
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Migrate(); err != nil {
		t.Fatal(err)
	}

	database.Exec(`INSERT INTO families (id, name) VALUES ('fam1', 'Sanders')`)
	database.Exec(`INSERT INTO family_members (id, name, role, color, family_id, vikunja_project_id) VALUES ('kid1', 'Nora', 'kid', '#ff0000', 'fam1', 100)`)
	database.Exec(`INSERT INTO family_members (id, name, role, color, family_id, vikunja_project_id) VALUES ('kid2', 'Eli', 'kid', '#00ff00', 'fam1', 200)`)
	database.Exec(`INSERT INTO sanders_cash_accounts (id, member_id, balance) VALUES ('acc1', 'kid1', 0)`)
	database.Exec(`INSERT INTO sanders_cash_accounts (id, member_id, balance) VALUES ('acc2', 'kid2', 0)`)

	mock := &mockVikunjaClient{}
	svc := NewChoreTemplateService(database, mock)

	t.Cleanup(func() { database.Close() })
	return svc, mock, database
}

func TestCreateTemplate_SingleAssignee(t *testing.T) {
	svc, mock, database := setupTemplateTest(t)

	tmpl, err := svc.CreateTemplate(context.Background(), CreateTemplateRequest{
		Title:        "Make your bed",
		Icon:         "🛏️",
		Recurrence:   "daily",
		RewardAmount: 5,
		AssignedMembers: []string{"kid1"},
	})
	if err != nil {
		t.Fatalf("CreateTemplate returned error: %v", err)
	}
	if tmpl.Title != "Make your bed" {
		t.Errorf("expected title 'Make your bed', got %s", tmpl.Title)
	}
	if tmpl.IsShared {
		t.Error("expected is_shared to be false for single assignee")
	}

	// Should have created 1 Vikunja task in kid1's project (ID 100)
	if len(mock.createdTasks) != 1 {
		t.Fatalf("expected 1 Vikunja task created, got %d", len(mock.createdTasks))
	}
	if mock.createdTasks[0].ProjectID != 100 {
		t.Errorf("expected task in project 100, got %d", mock.createdTasks[0].ProjectID)
	}
	if mock.createdTasks[0].Title != "Make your bed" {
		t.Errorf("expected task title 'Make your bed', got %s", mock.createdTasks[0].Title)
	}
	if mock.createdTasks[0].RepeatAfter != 86400 {
		t.Errorf("expected repeat_after 86400 for daily, got %d", mock.createdTasks[0].RepeatAfter)
	}

	// Template should be persisted in DB
	var dbTitle string
	var dbMembers string
	database.QueryRow(`SELECT title, assigned_members FROM chore_templates WHERE id = ?`, tmpl.ID).Scan(&dbTitle, &dbMembers)
	if dbTitle != "Make your bed" {
		t.Errorf("expected DB title 'Make your bed', got %s", dbTitle)
	}
	var members []string
	json.Unmarshal([]byte(dbMembers), &members)
	if len(members) != 1 || members[0] != "kid1" {
		t.Errorf("expected assigned_members ['kid1'], got %v", members)
	}
}

func TestCreateTemplate_SharedChore(t *testing.T) {
	svc, mock, _ := setupTemplateTest(t)

	tmpl, err := svc.CreateTemplate(context.Background(), CreateTemplateRequest{
		Title:           "Clean game room",
		Icon:            "🧹",
		Recurrence:      "weekly",
		RewardAmount:    10,
		AssignedMembers: []string{"kid1", "kid2"},
	})
	if err != nil {
		t.Fatalf("CreateTemplate returned error: %v", err)
	}
	if !tmpl.IsShared {
		t.Error("expected is_shared to be true for multiple assignees")
	}

	// Should have created 2 Vikunja tasks — one in each kid's project
	if len(mock.createdTasks) != 2 {
		t.Fatalf("expected 2 Vikunja tasks created, got %d", len(mock.createdTasks))
	}

	projectIDs := map[int64]bool{}
	for _, task := range mock.createdTasks {
		projectIDs[task.ProjectID] = true
		if task.RepeatAfter != 604800 {
			t.Errorf("expected repeat_after 604800 for weekly, got %d", task.RepeatAfter)
		}
		hasSharedLabel := false
		for _, l := range task.Labels {
			if l == "shared" {
				hasSharedLabel = true
			}
		}
		if !hasSharedLabel {
			t.Errorf("expected 'shared' label on task, got labels %v", task.Labels)
		}
	}
	if !projectIDs[100] || !projectIDs[200] {
		t.Errorf("expected tasks in projects 100 and 200, got %v", projectIDs)
	}
}

func TestListTemplatesWithStatus_IncludesAdHocKidTasks(t *testing.T) {
	svc, mock, _ := setupTemplateTest(t)
	mock.projectTasks = map[int64][]VikunjaTask{
		100: {
			{ID: 55, Title: "Clean your room", ProjectID: 100},
			{ID: 56, Title: "From a template", ProjectID: 100, Labels: []string{"template:abc"}},
		},
		200: {},
	}

	listed, err := svc.ListTemplatesWithStatus(context.Background())
	if err != nil {
		t.Fatalf("ListTemplatesWithStatus returned error: %v", err)
	}
	if len(listed) != 1 {
		t.Fatalf("expected 1 ad-hoc chore, got %d", len(listed))
	}
	got := listed[0]
	if !got.IsAdHoc {
		t.Error("expected isAdHoc true")
	}
	if got.Title != "Clean your room" {
		t.Errorf("expected title 'Clean your room', got %s", got.Title)
	}
	if got.ID != "vikunja:55" {
		t.Errorf("expected id vikunja:55, got %s", got.ID)
	}
	if len(got.AssignedMembers) != 1 || got.AssignedMembers[0] != "kid1" {
		t.Errorf("expected assigned to kid1, got %v", got.AssignedMembers)
	}
	if len(got.Tasks) != 1 || got.Tasks[0].VikunjaTaskID != 55 {
		t.Errorf("expected task 55 on the chore, got %+v", got.Tasks)
	}
}
