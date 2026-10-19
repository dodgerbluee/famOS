package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/sandershome/server/internal/config"
	"github.com/sandershome/server/internal/db"
)

// The briefing provider call must run detached from the request context:
// a client navigating away mid-generation previously canceled the call,
// cached nothing, and turned every reload into another doomed 500.
func TestBriefingSurvivesClientCancelAndSharesGeneration(t *testing.T) {
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	if err := database.Migrate(); err != nil {
		t.Fatal(err)
	}

	var completions atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/models":
			json.NewEncoder(w).Encode(map[string]any{"data": []any{}})
		case "/v1/chat/completions":
			completions.Add(1)
			time.Sleep(50 * time.Millisecond) // let concurrent requests pile up
			content := `{"date":"2026-10-19","summary":"A calm day ahead.","highlights":["School","Dinner at 6"]}`
			json.NewEncoder(w).Encode(map[string]any{
				"choices": []map[string]any{
					{"message": map[string]string{"role": "assistant", "content": content}, "finish_reason": "stop"},
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	database.Exec(`INSERT INTO ai_providers (id, name, url, model, kind, active) VALUES (?, 'fake', ?, 'm', 'openai', 1)`, uuid.NewString(), srv.URL)

	cfg := &config.Config{SessionSecret: "test-secret"}
	svc := NewServices(database, cfg)
	h := NewAIHandler(svc.AI, svc.Weather, svc.Calendar, svc.Cash, time.UTC)

	// Request whose context is already canceled — the old code died here.
	reqCtx, cancel := context.WithCancel(context.Background())
	cancel()
	req := httptest.NewRequest(http.MethodGet, "/api/ai/briefing", nil).WithContext(reqCtx)
	rec := httptest.NewRecorder()
	h.GetDailyBriefing(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("canceled-context briefing: got %d %s, want 200", rec.Code, rec.Body.String())
	}
	var body struct {
		Summary string `json:"summary"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body.Summary != "A calm day ahead." {
		t.Fatalf("unexpected body: %s", rec.Body.String())
	}
	if got := completions.Load(); got != 1 {
		t.Fatalf("provider calls = %d, want 1", got)
	}

	// Follow-up loads are served from cache — no additional provider calls.
	var wg sync.WaitGroup
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			rec := httptest.NewRecorder()
			h.GetDailyBriefing(rec, httptest.NewRequest(http.MethodGet, "/api/ai/briefing", nil))
			if rec.Code != http.StatusOK {
				t.Errorf("cached briefing: got %d, want 200", rec.Code)
			}
		}()
	}
	wg.Wait()

	if got := completions.Load(); got != 1 {
		t.Errorf("provider calls after concurrent cached loads = %d, want 1", got)
	}
}
