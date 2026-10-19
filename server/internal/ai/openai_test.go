package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/sandershome/server/internal/config"
	"github.com/sandershome/server/internal/db"
)

// fakeOpenAI serves an OpenAI-compatible API. When underV1 is true the API
// lives at /v1/..., otherwise at the root — covering both gateway layouts.
func fakeOpenAI(t *testing.T, underV1 bool, wantKey string) *httptest.Server {
	t.Helper()
	prefix := ""
	if underV1 {
		prefix = "/v1"
	}
	mux := http.NewServeMux()
	mux.HandleFunc(prefix+"/models", func(w http.ResponseWriter, r *http.Request) {
		if wantKey != "" && r.Header.Get("Authorization") != "Bearer "+wantKey {
			http.Error(w, `{"error":{"message":"unauthorized"}}`, http.StatusUnauthorized)
			return
		}
		json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]string{{"id": "gpt-4o"}, {"id": "o3-mini"}},
		})
	})
	mux.HandleFunc(prefix+"/chat/completions", func(w http.ResponseWriter, r *http.Request) {
		if wantKey != "" && r.Header.Get("Authorization") != "Bearer "+wantKey {
			http.Error(w, `{"error":{"message":"unauthorized"}}`, http.StatusUnauthorized)
			return
		}
		var req openaiChatRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("decode request: %v", err)
		}
		if req.Model != "gpt-4o" {
			t.Errorf("model = %q, want gpt-4o", req.Model)
		}
		if len(req.Messages) != 2 || req.Messages[0].Role != "system" || req.Messages[1].Role != "user" {
			t.Errorf("unexpected messages: %+v", req.Messages)
		}
		json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]string{"role": "assistant", "content": "hello from openai"}},
			},
		})
	})
	return httptest.NewServer(mux)
}

func TestOpenAICompleteUnderV1(t *testing.T) {
	srv := fakeOpenAI(t, true, "secret-key")
	defer srv.Close()

	p := NewOpenAIProvider(srv.URL, "gpt-4o", "secret-key")
	resp, err := p.Complete(context.Background(), CompletionRequest{
		System: "sys", Prompt: "hi", MaxTokens: 100, Temperature: 0.3,
	})
	if err != nil {
		t.Fatalf("complete: %v", err)
	}
	if resp.Text != "hello from openai" {
		t.Errorf("text = %q", resp.Text)
	}
}

func TestOpenAIPrefixDetectionAtRoot(t *testing.T) {
	srv := fakeOpenAI(t, false, "")
	defer srv.Close()

	p := NewOpenAIProvider(srv.URL, "gpt-4o", "")
	if !p.Available(context.Background()) {
		t.Fatal("expected provider to be available at root-mounted API")
	}
	models, err := p.ListModels(context.Background())
	if err != nil {
		t.Fatalf("list models: %v", err)
	}
	if len(models) != 2 || models[0] != "gpt-4o" {
		t.Errorf("models = %v", models)
	}
}

func TestOpenAIBadKeyReportsCheckYourAPIKey(t *testing.T) {
	srv := fakeOpenAI(t, true, "secret-key")
	defer srv.Close()

	p := NewOpenAIProvider(srv.URL, "gpt-4o", "wrong-key")
	if p.Available(context.Background()) {
		t.Fatal("expected unavailable with wrong key")
	}
}

// Some gateways only implement /chat/completions and serve their web UI
// (HTML) for every other path, including /models. Detection must fall back
// to a POST probe instead of declaring the endpoint unreachable.
func TestOpenAIChatOnlyGatewayWithHTMLModelsPage(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/models":
			w.Header().Set("Content-Type", "text/html")
			w.Write([]byte("<!DOCTYPE html><html><head><title>Gateway UI</title></head></html>"))
		case "/v1/chat/completions":
			if r.Method != http.MethodPost {
				http.NotFound(w, r)
				return
			}
			json.NewEncoder(w).Encode(map[string]any{
				"choices": []map[string]any{
					{"message": map[string]string{"role": "assistant", "content": `{"summary":"hi"}`}, "finish_reason": "stop"},
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	p := NewOpenAIProvider(srv.URL, "some-model", "secret-key")
	resp, err := p.Complete(context.Background(), CompletionRequest{Prompt: "hello"})
	if err != nil {
		t.Fatalf("Complete against chat-only gateway: %v", err)
	}
	if resp.Text == "" {
		t.Fatal("expected non-empty completion text")
	}
	if !p.Available(context.Background()) {
		t.Fatal("chat-only gateway should report Available")
	}
}

// A POST of an empty body to a real OpenAI-compatible endpoint answers with
// a JSON error; an HTML answer at both paths means the URL is wrong.
func TestOpenAIWebUIURLIsRejected(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte("<!DOCTYPE html><html>SPA fallback</html>"))
	}))
	defer srv.Close()

	p := NewOpenAIProvider(srv.URL, "some-model", "")
	_, err := p.Complete(context.Background(), CompletionRequest{Prompt: "hello"})
	if err == nil {
		t.Fatal("expected error when server serves HTML everywhere")
	}
}

func TestOpenAIEmptyContentIsAnError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]string{"content": ""}, "finish_reason": "length"},
			},
		})
	}))
	defer srv.Close()

	p := NewOpenAIProvider(srv.URL, "gpt-4o", "")
	_, err := p.Complete(context.Background(), CompletionRequest{Prompt: "hi"})
	if err == nil {
		t.Fatal("expected error for empty completion content")
	}
}

func TestEngineSelectsProviderByKind(t *testing.T) {
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if err := database.Migrate(); err != nil {
		t.Fatal(err)
	}

	cfg := &config.Config{OllamaURL: "http://localhost:11434", OllamaModel: "llama3"}

	srv := fakeOpenAI(t, true, "")
	defer srv.Close()

	id := uuid.NewString()
	database.Exec(`INSERT INTO ai_providers (id, name, url, model, kind, active) VALUES (?, 'Strata', ?, 'gpt-4o', 'openai', 1)`, id, srv.URL)

	e := NewEngine(cfg, database)
	if e.ProviderName() != "openai" {
		t.Errorf("active openai row: provider = %q, want openai", e.ProviderName())
	}

	database.Exec(`UPDATE ai_providers SET kind = 'ollama' WHERE id = ?`, id)
	e.Reload(cfg)
	if e.ProviderName() != "ollama" {
		t.Errorf("active ollama row: provider = %q, want ollama", e.ProviderName())
	}

	database.Exec(`DELETE FROM ai_providers`)
	e.Reload(cfg)
	if e.ProviderName() != "ollama" {
		t.Errorf("no rows: provider = %q, want env-configured ollama", e.ProviderName())
	}
}
