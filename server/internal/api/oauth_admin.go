package api

import (
	"database/sql"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/sandershome/server/internal/db"
	"github.com/sandershome/server/internal/oauth"
)

type OAuthAdminHandler struct {
	db       *db.DB
	registry *oauth.Registry
}

func NewOAuthAdminHandler(database *db.DB, registry *oauth.Registry) *OAuthAdminHandler {
	return &OAuthAdminHandler{db: database, registry: registry}
}

type oauthProviderRow struct {
	ID           string
	Name         string
	DisplayName  string
	ProviderType string
	ClientID     string
	ClientSecret string
	IssuerURL    string
	Scopes       string
	AutoRegister bool
	Enabled      bool
	CreatedAt    string
	UpdatedAt    string
}

func shapeProvider(row oauthProviderRow) map[string]any {
	return map[string]any{
		"id":             row.ID,
		"name":           row.Name,
		"displayName":    row.DisplayName,
		"providerType":   row.ProviderType,
		"clientId":       row.ClientID,
		"issuerUrl":      row.IssuerURL,
		"scopes":         row.Scopes,
		"autoRegister":   row.AutoRegister,
		"enabled":        row.Enabled,
		"createdAt":      row.CreatedAt,
		"updatedAt":      row.UpdatedAt,
		"hasClientSecret": row.ClientSecret != "",
	}
}

func (h *OAuthAdminHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(`
		SELECT id, name, display_name, provider_type, client_id, client_secret, issuer_url, scopes,
		       auto_register, enabled, created_at, updated_at
		FROM oauth_providers ORDER BY created_at`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list providers")
		return
	}
	defer rows.Close()

	out := []map[string]any{}
	for rows.Next() {
		var row oauthProviderRow
		if err := scanProviderRow(rows, &row); err != nil {
			continue
		}
		out = append(out, shapeProvider(row))
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *OAuthAdminHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name         string `json:"name"`
		DisplayName  string `json:"displayName"`
		ProviderType string `json:"providerType"`
		ClientID     string `json:"clientId"`
		ClientSecret string `json:"clientSecret"`
		IssuerURL    string `json:"issuerUrl"`
		Scopes       string `json:"scopes"`
		AutoRegister *bool  `json:"autoRegister"`
		Enabled      *bool  `json:"enabled"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	name := strings.TrimSpace(req.Name)
	displayName := strings.TrimSpace(req.DisplayName)
	providerType := strings.ToLower(strings.TrimSpace(req.ProviderType))
	clientID := strings.TrimSpace(req.ClientID)
	issuerURL := strings.TrimSpace(req.IssuerURL)
	scopes := strings.TrimSpace(req.Scopes)
	if scopes == "" {
		scopes = "openid,profile,email"
	}
	if name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if displayName == "" {
		writeError(w, http.StatusBadRequest, "displayName is required")
		return
	}
	if !oauth.SupportedType(providerType) {
		writeError(w, http.StatusBadRequest, "providerType must be one of: authentik, generic_oidc")
		return
	}
	if clientID == "" {
		writeError(w, http.StatusBadRequest, "clientId is required")
		return
	}
	if req.ClientSecret == "" {
		writeError(w, http.StatusBadRequest, "clientSecret is required")
		return
	}
	if _, err := url.ParseRequestURI(issuerURL); err != nil {
		writeError(w, http.StatusBadRequest, "issuerUrl must be a valid URL")
		return
	}

	autoRegister := true
	if req.AutoRegister != nil {
		autoRegister = *req.AutoRegister
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	id := uuid.New().String()
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := h.db.Exec(`
		INSERT INTO oauth_providers
			(id, name, display_name, provider_type, client_id, client_secret, issuer_url, scopes, auto_register, enabled, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, name, displayName, providerType, clientID, req.ClientSecret, issuerURL, scopes, autoRegister, enabled, now, now)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			writeError(w, http.StatusConflict, "a provider with this name already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create provider")
		return
	}

	h.registry.Reload()
	row, err := h.getProvider(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "provider created but failed to load")
		return
	}
	writeJSON(w, http.StatusCreated, shapeProvider(*row))
}

func (h *OAuthAdminHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	existing, err := h.getProvider(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "OAuth provider not found")
		return
	}

	var req struct {
		DisplayName  *string `json:"displayName"`
		ProviderType *string `json:"providerType"`
		ClientID     *string `json:"clientId"`
		ClientSecret *string `json:"clientSecret"`
		IssuerURL    *string `json:"issuerUrl"`
		Scopes       *string `json:"scopes"`
		AutoRegister *bool   `json:"autoRegister"`
		Enabled      *bool   `json:"enabled"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	displayName := existing.DisplayName
	if req.DisplayName != nil {
		displayName = strings.TrimSpace(*req.DisplayName)
	}
	providerType := existing.ProviderType
	if req.ProviderType != nil {
		providerType = strings.ToLower(strings.TrimSpace(*req.ProviderType))
		if !oauth.SupportedType(providerType) {
			writeError(w, http.StatusBadRequest, "providerType must be one of: authentik, generic_oidc")
			return
		}
	}
	clientID := existing.ClientID
	if req.ClientID != nil {
		clientID = strings.TrimSpace(*req.ClientID)
	}
	clientSecret := existing.ClientSecret
	if req.ClientSecret != nil && *req.ClientSecret != "" {
		clientSecret = *req.ClientSecret
	}
	issuerURL := existing.IssuerURL
	if req.IssuerURL != nil {
		issuerURL = strings.TrimSpace(*req.IssuerURL)
		if _, err := url.ParseRequestURI(issuerURL); err != nil {
			writeError(w, http.StatusBadRequest, "issuerUrl must be a valid URL")
			return
		}
	}
	scopes := existing.Scopes
	if req.Scopes != nil {
		scopes = strings.TrimSpace(*req.Scopes)
	}
	autoRegister := existing.AutoRegister
	if req.AutoRegister != nil {
		autoRegister = *req.AutoRegister
	}
	enabled := existing.Enabled
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_, err = h.db.Exec(`
		UPDATE oauth_providers SET
			display_name = ?, provider_type = ?, client_id = ?, client_secret = ?,
			issuer_url = ?, scopes = ?, auto_register = ?, enabled = ?, updated_at = ?
		WHERE id = ?`,
		displayName, providerType, clientID, clientSecret, issuerURL, scopes, autoRegister, enabled, now, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update provider")
		return
	}

	h.registry.Reload()
	row, err := h.getProvider(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "OAuth provider not found")
		return
	}
	writeJSON(w, http.StatusOK, shapeProvider(*row))
}

func (h *OAuthAdminHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	res, err := h.db.Exec(`DELETE FROM oauth_providers WHERE id = ?`, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete provider")
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeError(w, http.StatusNotFound, "OAuth provider not found")
		return
	}
	h.registry.Reload()
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *OAuthAdminHandler) getProvider(id string) (*oauthProviderRow, error) {
	row := h.db.QueryRow(`
		SELECT id, name, display_name, provider_type, client_id, client_secret, issuer_url, scopes,
		       auto_register, enabled, created_at, updated_at
		FROM oauth_providers WHERE id = ?`, id)
	var out oauthProviderRow
	if err := scanProvider(row, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

type providerScanner interface {
	Scan(dest ...any) error
}

func scanProviderRow(rows *sql.Rows, out *oauthProviderRow) error {
	return scanProvider(rows, out)
}

func scanProvider(s providerScanner, out *oauthProviderRow) error {
	return s.Scan(
		&out.ID, &out.Name, &out.DisplayName, &out.ProviderType, &out.ClientID, &out.ClientSecret,
		&out.IssuerURL, &out.Scopes, &out.AutoRegister, &out.Enabled, &out.CreatedAt, &out.UpdatedAt,
	)
}
