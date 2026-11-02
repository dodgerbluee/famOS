package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/sandershome/server/internal/db"
)

func TestActivityListPersistsDailyCompletion(t *testing.T) {
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	if err := database.Migrate(); err != nil {
		t.Fatal(err)
	}

	familyID := uuid.New().String()
	memberID := uuid.New().String()
	database.Exec(`INSERT INTO families (id, name) VALUES (?, 'Test')`, familyID)
	database.Exec(`INSERT INTO family_members (id, name, role, color, family_id) VALUES (?, 'Kid', 'kid', '#fff', ?)`, memberID, familyID)

	svc := NewActivityService(database, NewVikunjaService(database), time.UTC)
	dateKey := time.Now().UTC().Format("2006-01-02")
	if err := svc.RecordCompletion(familyID, memberID, "chore", dateKey); err != nil {
		t.Fatal(err)
	}
	days, err := svc.List(context.Background(), familyID, 7)
	if err != nil {
		t.Fatal(err)
	}
	if len(days) != 1 {
		t.Fatalf("got %d activity rows, want 1", len(days))
	}
	if days[0].Total != 1 || days[0].Completed != 1 || days[0].Kind != "chore" {
		t.Fatalf("unexpected activity row: %+v", days[0])
	}
}
