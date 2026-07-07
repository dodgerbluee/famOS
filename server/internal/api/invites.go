package api

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/sandershome/server/internal/auth"
	"github.com/sandershome/server/internal/config"
	"github.com/sandershome/server/internal/db"
)

type InviteHandler struct {
	db  *db.DB
	cfg *config.Config
}

func NewInviteHandler(database *db.DB, cfg *config.Config) *InviteHandler {
	return &InviteHandler{db: database, cfg: cfg}
}

func (h *InviteHandler) Create(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var req struct {
		Role string `json:"role"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if req.Role != "admin" && req.Role != "parent" && req.Role != "kid" {
		writeError(w, http.StatusBadRequest, "role must be admin, parent, or kid")
		return
	}

	tokenBytes := make([]byte, 32)
	rand.Read(tokenBytes)
	token := hex.EncodeToString(tokenBytes)

	id := uuid.New().String()
	expiresAt := time.Now().Add(7 * 24 * time.Hour)

	_, err := h.db.Exec(
		`INSERT INTO invite_links (id, token, family_id, role, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
		id, token, user.FamilyID, req.Role, user.MemberID, expiresAt,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":        id,
		"token":     token,
		"role":      req.Role,
		"expiresAt": expiresAt.Format(time.RFC3339),
	})
}

func (h *InviteHandler) List(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	rows, err := h.db.Query(
		`SELECT i.id, i.token, i.role, i.expires_at, i.created_at, m.name as created_by_name
		FROM invite_links i
		JOIN family_members m ON m.id = i.created_by
		WHERE i.family_id = ? AND i.used_by IS NULL AND i.expires_at > ?
		ORDER BY i.created_at DESC`,
		user.FamilyID, time.Now(),
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()

	type invite struct {
		ID            string `json:"id"`
		Token         string `json:"token"`
		Role          string `json:"role"`
		ExpiresAt     string `json:"expiresAt"`
		CreatedAt     string `json:"createdAt"`
		CreatedByName string `json:"createdByName"`
	}

	invites := []invite{}
	for rows.Next() {
		var i invite
		if rows.Scan(&i.ID, &i.Token, &i.Role, &i.ExpiresAt, &i.CreatedAt, &i.CreatedByName) == nil {
			invites = append(invites, i)
		}
	}
	writeJSON(w, http.StatusOK, invites)
}

func (h *InviteHandler) Revoke(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	id := chi.URLParam(r, "id")
	_, err := h.db.Exec(
		`DELETE FROM invite_links WHERE id = ? AND family_id = ? AND used_by IS NULL`,
		id, user.FamilyID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *InviteHandler) Validate(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")

	var role, familyID, familyName string
	var expiresAt time.Time
	err := h.db.QueryRow(
		`SELECT i.role, i.family_id, f.name, i.expires_at
		FROM invite_links i
		JOIN families f ON f.id = i.family_id
		WHERE i.token = ? AND i.used_by IS NULL`,
		token,
	).Scan(&role, &familyID, &familyName, &expiresAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "invite not found or already used")
		return
	}

	if time.Now().After(expiresAt) {
		writeError(w, http.StatusGone, "invite has expired")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"valid":      true,
		"role":       role,
		"familyName": familyName,
	})
}

func (h *InviteHandler) Accept(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token    string `json:"token"`
		Name     string `json:"name"`
		Username string `json:"username"`
		Password string `json:"password"`
		Color    string `json:"color"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if req.Token == "" || req.Name == "" || req.Username == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "token, name, username, and password are required")
		return
	}
	if req.Color == "" {
		req.Color = "#89b4fa"
	}

	var inviteID, role, familyID string
	var expiresAt time.Time
	err := h.db.QueryRow(
		`SELECT id, role, family_id, expires_at FROM invite_links WHERE token = ? AND used_by IS NULL`,
		req.Token,
	).Scan(&inviteID, &role, &familyID, &expiresAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "invite not found or already used")
		return
	}
	if time.Now().After(expiresAt) {
		writeError(w, http.StatusGone, "invite has expired")
		return
	}

	var existing int
	h.db.QueryRow(`SELECT COUNT(*) FROM family_members WHERE username = ?`, req.Username).Scan(&existing)
	if existing > 0 {
		writeError(w, http.StatusConflict, "username already in use")
		return
	}

	passwordHash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	memberID := uuid.New().String()

	tx, err := h.db.Begin()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()

	tx.Exec(`INSERT INTO family_members (id, name, role, color, family_id, username, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		memberID, req.Name, role, req.Color, familyID, req.Username, passwordHash)

	if role == "kid" {
		tx.Exec(`INSERT INTO sanders_cash_accounts (id, member_id, balance) VALUES (?, ?, 0)`,
			uuid.New().String(), memberID)
	}

	tx.Exec(`UPDATE invite_links SET used_by = ?, used_at = ? WHERE id = ?`,
		memberID, time.Now(), inviteID)

	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	token, err := auth.CreateSession(h.db, h.cfg.SessionSecret, memberID, "user")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	setSessionCookie(w, token, 30*24*time.Hour)

	writeJSON(w, http.StatusOK, map[string]any{
		"memberId": memberID,
		"name":     req.Name,
		"role":     role,
		"familyId": familyID,
		"color":    req.Color,
		"username": req.Username,
	})
}
