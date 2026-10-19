package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/sandershome/server/internal/ai"
	"github.com/sandershome/server/internal/config"
	"github.com/sandershome/server/internal/db"
)

type AIProvidersHandler struct {
	db     *db.DB
	engine *ai.Engine
	cfg    *config.Config
}

func NewAIProvidersHandler(database *db.DB, engine *ai.Engine, cfg *config.Config) *AIProvidersHandler {
	return &AIProvidersHandler{db: database, engine: engine, cfg: cfg}
}

type aiProviderRow struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	URL    string `json:"url"`
	APIKey string `json:"apiKey"`
	Model  string `json:"model"`
	Kind   string `json:"kind"`
	Active bool   `json:"active"`
}

func (h *AIProvidersHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(`SELECT id, name, url, api_key, model, COALESCE(kind, 'ollama'), active FROM ai_providers ORDER BY created_at`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	providers := []aiProviderRow{}
	for rows.Next() {
		var p aiProviderRow
		var active int
		if err := rows.Scan(&p.ID, &p.Name, &p.URL, &p.APIKey, &p.Model, &p.Kind, &active); err != nil {
			continue
		}
		p.Active = active == 1
		if p.APIKey != "" {
			p.APIKey = "••••••••"
		}
		providers = append(providers, p)
	}
	writeJSON(w, http.StatusOK, providers)
}

type createProviderReq struct {
	Name   string `json:"name"`
	URL    string `json:"url"`
	APIKey string `json:"apiKey"`
	Kind   string `json:"kind"`
}

func (h *AIProvidersHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createProviderReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.URL == "" {
		writeError(w, http.StatusBadRequest, "url is required")
		return
	}
	if req.Name == "" {
		req.Name = "AI Provider"
	}
	if req.Kind == "" {
		req.Kind = "ollama"
	}
	if req.Kind != "ollama" && req.Kind != "openai" {
		writeError(w, http.StatusBadRequest, "kind must be ollama or openai")
		return
	}

	id := uuid.NewString()
	_, err := h.db.Exec(
		`INSERT INTO ai_providers (id, name, url, api_key, kind) VALUES (?, ?, ?, ?, ?)`,
		id, req.Name, req.URL, req.APIKey, req.Kind,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

type updateProviderReq struct {
	Name   *string `json:"name,omitempty"`
	URL    *string `json:"url,omitempty"`
	APIKey *string `json:"apiKey,omitempty"`
	Model  *string `json:"model,omitempty"`
	Kind   *string `json:"kind,omitempty"`
	Active *bool   `json:"active,omitempty"`
}

func (h *AIProvidersHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req updateProviderReq
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	tx, err := h.db.Begin()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()

	if req.Active != nil && *req.Active {
		tx.Exec(`UPDATE ai_providers SET active = 0`)
		tx.Exec(`UPDATE ai_providers SET active = 1 WHERE id = ?`, id)
	}
	if req.Active != nil && !*req.Active {
		tx.Exec(`UPDATE ai_providers SET active = 0 WHERE id = ?`, id)
	}
	if req.Name != nil {
		tx.Exec(`UPDATE ai_providers SET name = ? WHERE id = ?`, *req.Name, id)
	}
	if req.URL != nil {
		tx.Exec(`UPDATE ai_providers SET url = ? WHERE id = ?`, *req.URL, id)
	}
	if req.APIKey != nil && *req.APIKey != "••••••••" {
		tx.Exec(`UPDATE ai_providers SET api_key = ? WHERE id = ?`, *req.APIKey, id)
	}
	if req.Model != nil {
		tx.Exec(`UPDATE ai_providers SET model = ? WHERE id = ?`, *req.Model, id)
	}
	if req.Kind != nil {
		if *req.Kind != "ollama" && *req.Kind != "openai" {
			writeError(w, http.StatusBadRequest, "kind must be ollama or openai")
			return
		}
		tx.Exec(`UPDATE ai_providers SET kind = ? WHERE id = ?`, *req.Kind, id)
	}

	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.engine.Reload(h.cfg)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *AIProvidersHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, err := h.db.Exec(`DELETE FROM ai_providers WHERE id = ?`, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.engine.Reload(h.cfg)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *AIProvidersHandler) TestConnection(w http.ResponseWriter, r *http.Request) {
	var req struct {
		URL    string `json:"url"`
		APIKey string `json:"apiKey"`
		Kind   string `json:"kind"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	provider := ai.NewProvider(req.Kind, req.URL, "", req.APIKey)
	models, err := provider.ListModels(r.Context())
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":     false,
			"error":  err.Error(),
			"models": []string{},
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":     true,
		"models": models,
	})
}

func (h *AIProvidersHandler) ListModels(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var url, apiKey, kind string
	err := h.db.QueryRow(`SELECT url, api_key, COALESCE(kind, 'ollama') FROM ai_providers WHERE id = ?`, id).Scan(&url, &apiKey, &kind)
	if err != nil {
		writeError(w, http.StatusNotFound, "provider not found")
		return
	}
	provider := ai.NewProvider(kind, url, "", apiKey)
	models, err := provider.ListModels(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, models)
}
