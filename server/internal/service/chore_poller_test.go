package service

import (
	"context"
	"testing"

	"github.com/sandershome/server/internal/db"
)

type mockCompletedTaskFetcher struct {
	tasksByProject map[int64][]CompletedTask
}

func (m *mockCompletedTaskFetcher) GetCompletedTasks(ctx context.Context, projectID int64) ([]CompletedTask, error) {
	return m.tasksByProject[projectID], nil
}

func setupPollerTest(t *testing.T) (*ChorePollerService, *mockCompletedTaskFetcher, *db.DB) {
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
	database.Exec(`INSERT INTO sanders_cash_accounts (id, member_id, balance) VALUES ('acc1', 'kid1', 0)`)

	// Create a chore template
	database.Exec(`INSERT INTO chore_templates (id, title, icon, recurrence, reward_amount, is_shared, assigned_members, vikunja_label, active)
		VALUES ('tmpl1', 'Make your bed', '🛏️', 'daily', 5, FALSE, '["kid1"]', 'template:tmpl1', TRUE)`)

	mock := &mockCompletedTaskFetcher{tasksByProject: map[int64][]CompletedTask{}}
	cashSvc := NewSandersCashService(database)
	svc := NewChorePollerService(database, mock, cashSvc)

	t.Cleanup(func() { database.Close() })
	return svc, mock, database
}

func TestPoller_AwardsSandersCashOnCompletion(t *testing.T) {
	svc, mock, database := setupPollerTest(t)

	mock.tasksByProject[100] = []CompletedTask{
		{ID: 10, Title: "Make your bed", DoneAt: "2026-08-08T10:00:00Z", ProjectID: 100, Labels: []string{"template:tmpl1"}},
	}

	err := svc.Poll(context.Background())
	if err != nil {
		t.Fatalf("Poll returned error: %v", err)
	}

	var balance int
	database.QueryRow(`SELECT balance FROM sanders_cash_accounts WHERE member_id = 'kid1'`).Scan(&balance)
	if balance != 5 {
		t.Errorf("expected balance 5 after chore completion, got %d", balance)
	}
}

func TestPoller_DoesNotDoubleAward(t *testing.T) {
	svc, mock, database := setupPollerTest(t)

	mock.tasksByProject[100] = []CompletedTask{
		{ID: 10, Title: "Make your bed", DoneAt: "2026-08-08T10:00:00Z", ProjectID: 100, Labels: []string{"template:tmpl1"}},
	}

	svc.Poll(context.Background())
	svc.Poll(context.Background())

	var balance int
	database.QueryRow(`SELECT balance FROM sanders_cash_accounts WHERE member_id = 'kid1'`).Scan(&balance)
	if balance != 5 {
		t.Errorf("expected balance 5 after double poll (no double award), got %d", balance)
	}
}

func TestPoller_IgnoresTasksWithoutTemplateLabel(t *testing.T) {
	svc, mock, database := setupPollerTest(t)

	mock.tasksByProject[100] = []CompletedTask{
		{ID: 20, Title: "Random task", DoneAt: "2026-08-08T10:00:00Z", ProjectID: 100, Labels: []string{}},
	}

	svc.Poll(context.Background())

	var balance int
	database.QueryRow(`SELECT balance FROM sanders_cash_accounts WHERE member_id = 'kid1'`).Scan(&balance)
	if balance != 0 {
		t.Errorf("expected balance 0 for non-template task, got %d", balance)
	}
}
