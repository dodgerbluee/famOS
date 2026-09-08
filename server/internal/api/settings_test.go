package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/sandershome/server/internal/db"
)

func TestSettingsGet_DoesNotDeadlockOnNestedQuery(t *testing.T) {
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	if err := database.Migrate(); err != nil {
		t.Fatal(err)
	}

	familyID := uuid.New().String()
	database.Exec(`INSERT INTO families (id, name) VALUES (?, 'Sanders')`, familyID)
	database.Exec(`INSERT INTO app_settings (key, value) VALUES ('timezone', '"America/Chicago"')`)

	h := &SettingsHandler{db: database}
	req := httptest.NewRequest(http.MethodGet, "/api/settings", nil)
	rec := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		h.Get(rec, req)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("deadlocked: settings Get queried families while app_settings rows were still open")
	}

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}
