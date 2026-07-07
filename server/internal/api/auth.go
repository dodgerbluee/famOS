package api

import (
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/sandershome/server/internal/auth"
	"github.com/sandershome/server/internal/config"
	"github.com/sandershome/server/internal/db"
)

type AuthHandler struct {
	db  *db.DB
	cfg *config.Config
}

func (h *AuthHandler) SetupStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{
		"needsSetup": auth.NeedsSetup(h.db),
	})
}

func (h *AuthHandler) Setup(w http.ResponseWriter, r *http.Request) {
	if !auth.NeedsSetup(h.db) {
		writeError(w, http.StatusForbidden, "already initialized")
		return
	}

	var req struct {
		FamilyName string `json:"familyName"`
		Name       string `json:"name"`
		Username   string `json:"username"`
		Password   string `json:"password"`
		Color      string `json:"color"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if req.FamilyName == "" || req.Name == "" || req.Username == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "familyName, name, username, and password are required")
		return
	}
	if req.Color == "" {
		req.Color = "#89b4fa"
	}

	passwordHash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	familyID := uuid.New().String()
	memberID := uuid.New().String()

	tx, err := h.db.Begin()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()

	tx.Exec(`INSERT INTO families (id, name) VALUES (?, ?)`, familyID, req.FamilyName)
	tx.Exec(`INSERT INTO family_members (id, name, role, color, family_id, username, password_hash) VALUES (?, ?, 'admin', ?, ?, ?, ?)`,
		memberID, req.Name, req.Color, familyID, req.Username, passwordHash)

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
		"role":     "admin",
		"familyId": familyID,
		"color":    req.Color,
		"username": req.Username,
	})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	log.Printf("LOGIN ATTEMPT: username=%q", req.Username)
	var count int
	h.db.QueryRow(`SELECT COUNT(*) FROM family_members`).Scan(&count)
	var dbUsername, dbHash string
	h.db.QueryRow(`SELECT COALESCE(username,''), COALESCE(password_hash,'') FROM family_members LIMIT 1`).Scan(&dbUsername, &dbHash)
	log.Printf("LOGIN DEBUG: total_members=%d first_member_username=%q hash_len=%d", count, dbUsername, len(dbHash))
	memberID, passwordHash, _, err := auth.FindMemberByUsername(h.db, req.Username)
	if err != nil {
		log.Printf("LOGIN FAIL: FindMemberByUsername error: %v", err)
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	log.Printf("LOGIN: found member=%s, hash_len=%d", memberID, len(passwordHash))

	if passwordHash == "" || !auth.CheckPassword(passwordHash, req.Password) {
		log.Printf("LOGIN FAIL: password check failed (hash empty: %v)", passwordHash == "")
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	token, err := auth.CreateSession(h.db, h.cfg.SessionSecret, memberID, "user")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	setSessionCookie(w, token, 30*24*time.Hour)

	var name, role, familyID, color, username string
	h.db.QueryRow(`SELECT name, role, family_id, color, COALESCE(username, '') FROM family_members WHERE id = ?`, memberID).
		Scan(&name, &role, &familyID, &color, &username)

	writeJSON(w, http.StatusOK, map[string]any{
		"memberId": memberID,
		"name":     name,
		"role":     role,
		"familyId": familyID,
		"color":    color,
		"username": username,
	})
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session")
	if err == nil {
		hash := auth.TokenHash(cookie.Value)
		auth.DeleteSession(h.db, hash)
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	permissions := auth.ResolvePermissions(user.Role, user.Overrides)

	writeJSON(w, http.StatusOK, map[string]any{
		"memberId":    user.MemberID,
		"name":        user.Name,
		"role":        user.Role,
		"familyId":    user.FamilyID,
		"color":       user.Color,
		"username":    user.Username,
		"permissions": permissions,
	})
}

func (h *AuthHandler) PinVerify(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MemberID string `json:"memberId"`
		Pin      string `json:"pin"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	var pinHash, role string
	err := h.db.QueryRow(`SELECT pin_hash, role FROM family_members WHERE id = ?`, req.MemberID).Scan(&pinHash, &role)
	if err != nil || pinHash == "" {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	if !auth.CheckPin(pinHash, req.Pin) {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"valid":    true,
		"memberId": req.MemberID,
		"role":     role,
	})
}

func setSessionCookie(w http.ResponseWriter, token string, maxAge time.Duration) {
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(maxAge / time.Second),
	})
}
