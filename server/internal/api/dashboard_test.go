package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/sandershome/server/internal/ai"
	"github.com/sandershome/server/internal/config"
	"github.com/sandershome/server/internal/db"
	"github.com/sandershome/server/internal/service"
)

func TestDashboardGet_ReturnsBoundedJSONWithoutIntegrations(t *testing.T) {
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
	database.Exec(`INSERT INTO families (id, name) VALUES (?, 'Sanders')`, familyID)
	database.Exec(`INSERT INTO family_members (id, name, role, color, family_id, username, password_hash) VALUES (?, 'Greg', 'admin', '#89b4fa', ?, 'greg', 'x')`, memberID, familyID)
	kidID := uuid.New().String()
	database.Exec(`INSERT INTO family_members (id, name, role, color, family_id) VALUES (?, 'Kid', 'kid', '#a6e3a1', ?)`, kidID, familyID)
	database.Exec(`INSERT INTO sanders_cash_accounts (id, member_id, balance) VALUES (?, ?, 500)`, uuid.New().String(), kidID)

	cfg := &config.Config{Timezone: "UTC"}
	svc := NewServices(database, cfg)
	h := &DashboardHandler{
		db:       database,
		cash:     svc.Cash,
		cal:      svc.Calendar,
		chores:   svc.ChoreTemplates,
		weather:  svc.Weather,
		ai:       ai.NewEngine(cfg, database),
		gatus:    service.NewGatusService(database),
		seerr:    service.NewSeerrService(database),
		vikunja:  svc.Vikunja,
		currency: svc.Currency,
		location: time.UTC,
	}

	req := httptest.NewRequest(http.MethodGet, "/api/dashboard", nil)
	rec := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		h.Get(rec, req)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("dashboard Get hung")
	}

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Cache-Control") != "private, max-age=10" {
		t.Fatalf("expected short private cache, got %q", rec.Header().Get("Cache-Control"))
	}

	var body DashboardResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Settings["family_name"] != "Sanders" {
		t.Fatalf("family name: %+v", body.Settings)
	}
	if len(body.Family) != 2 {
		t.Fatalf("expected 2 family members, got %d", len(body.Family))
	}
	if body.Briefing != nil {
		t.Fatal("uncached briefing must be null so Ollama cannot stall TTFB")
	}
	if _, ok := body.AI["provider"]; !ok {
		t.Fatal("ai provider should be present without a live ping")
	}
}
