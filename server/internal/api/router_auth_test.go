package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/sandershome/server/internal/auth"
	"github.com/sandershome/server/internal/background"
	"github.com/sandershome/server/internal/config"
	"github.com/sandershome/server/internal/db"
	"github.com/sandershome/server/internal/service"
)

// buildTestRouter wires the real router the same way cmd/sandershome does,
// against an in-memory database with no Frigate configured.
func buildTestRouter(t *testing.T) (http.Handler, *db.DB) {
	t.Helper()
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	if err := database.Migrate(); err != nil {
		t.Fatal(err)
	}

	cfg := &config.Config{SessionSecret: "test-secret"}
	hub := NewHub()
	go hub.Run()
	svc := NewServices(database, cfg)
	batchSvc := service.NewBatchService(database)
	chorePoller := service.NewChorePollerService(database, svc.Vikunja, svc.Cash)
	scheduler := background.NewScheduler(svc.Calendar, svc.Weather, svc.Cash, svc.AI, batchSvc, chorePoller, database, hub.Broadcast, cfg.Timezone)

	return NewRouter(database, cfg, svc, hub, batchSvc, scheduler), database
}

// Camera media (live streams, snapshots, event thumbnails) must never be
// reachable anonymously: the deployment is exposed to the internet.
func TestCameraRoutesRequireAuth(t *testing.T) {
	router, database := buildTestRouter(t)

	paths := []string{
		"/api/cameras",
		"/api/cameras/status",
		"/api/cameras/boys/snapshot",
		"/api/cameras/boys/stream",
		"/api/cameras/events",
		"/api/cameras/events/abc123/thumbnail",
		"/api/cameras/frigate/open",
	}

	for _, path := range paths {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("anonymous GET %s: got %d, want 401", path, rec.Code)
		}
	}

	familyID := uuid.New().String()
	memberID := uuid.New().String()
	database.Exec(`INSERT INTO families (id, name) VALUES (?, 'Test')`, familyID)
	database.Exec(`INSERT INTO family_members (id, name, role, color, family_id, username, password_hash) VALUES (?, 'Greg', 'admin', '#89b4fa', ?, 'greg', 'hash')`, memberID, familyID)

	// Both family sessions and paired-kiosk sessions must pass the auth gate
	// (the handlers themselves may still fail on unconfigured Frigate).
	for _, sessionType := range []string{"user", "kiosk"} {
		token, err := auth.CreateSession(database, "test-secret", memberID, sessionType)
		if err != nil {
			t.Fatalf("create %s session: %v", sessionType, err)
		}
		for _, path := range paths {
			req := httptest.NewRequest(http.MethodGet, path, nil)
			req.AddCookie(&http.Cookie{Name: "session", Value: token})
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			if rec.Code == http.StatusUnauthorized || rec.Code == http.StatusForbidden {
				t.Errorf("%s session GET %s: got %d, want access", sessionType, path, rec.Code)
			}
		}
	}
}
