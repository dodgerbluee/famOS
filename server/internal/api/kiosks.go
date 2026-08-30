package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/sandershome/server/internal/auth"
	"github.com/sandershome/server/internal/config"
	"github.com/sandershome/server/internal/db"
)

const kioskPairingTTL = 15 * time.Minute
const kioskColor = "#6c7086"

type KioskHandler struct {
	db  *db.DB
	cfg *config.Config
}

func NewKioskHandler(database *db.DB, cfg *config.Config) *KioskHandler {
	return &KioskHandler{db: database, cfg: cfg}
}

type kioskResponse struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Paired       bool   `json:"paired"`
	LastSeenAt   string `json:"lastSeenAt,omitempty"`
	UserAgent    string `json:"userAgent,omitempty"`
	CreatedAt    string `json:"createdAt"`
	PairingToken string `json:"pairingToken,omitempty"`
	ExpiresAt    string `json:"expiresAt,omitempty"`
}

func (h *KioskHandler) List(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	rows, err := h.db.Query(`
		SELECT m.id, m.name, m.created_at,
			COALESCE((SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.member_id = m.id AND s.session_type = 'kiosk'), ''),
			COALESCE((SELECT s.user_agent FROM sessions s WHERE s.member_id = m.id AND s.session_type = 'kiosk' ORDER BY s.last_seen_at DESC LIMIT 1), ''),
			(SELECT COUNT(*) FROM sessions s WHERE s.member_id = m.id AND s.session_type = 'kiosk')
		FROM family_members m
		WHERE m.role = 'kiosk' AND m.family_id = ?
		ORDER BY m.created_at`, user.FamilyID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list kiosks")
		return
	}
	defer rows.Close()

	kiosks := []kioskResponse{}
	for rows.Next() {
		var k kioskResponse
		var lastSeen, userAgent string
		var sessionCount int
		if err := rows.Scan(&k.ID, &k.Name, &k.CreatedAt, &lastSeen, &userAgent, &sessionCount); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to scan kiosk")
			return
		}
		k.Paired = sessionCount > 0
		k.LastSeenAt = lastSeen
		k.UserAgent = userAgent
		kiosks = append(kiosks, k)
	}
	writeJSON(w, http.StatusOK, kiosks)
}

func (h *KioskHandler) Create(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var req struct {
		Name string `json:"name"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	memberID, err := h.insertKioskMember(user.FamilyID, req.Name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create kiosk")
		return
	}

	pairingToken, expiresAt, err := h.insertPairingToken(user.FamilyID, memberID, user.MemberID, req.Name, "approved", "")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create pairing")
		return
	}

	writeJSON(w, http.StatusCreated, kioskResponse{
		ID:           memberID,
		Name:         req.Name,
		PairingToken: pairingToken,
		ExpiresAt:    expiresAt.Format(time.RFC3339),
	})
}

func (h *KioskHandler) CreatePairing(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	id := chi.URLParam(r, "id")
	var name, familyID, role string
	err := h.db.QueryRow(`SELECT name, family_id, role FROM family_members WHERE id = ?`, id).Scan(&name, &familyID, &role)
	if err != nil || role != "kiosk" || familyID != user.FamilyID {
		writeError(w, http.StatusNotFound, "kiosk not found")
		return
	}

	h.db.Exec(`UPDATE kiosk_pairing_tokens SET status = 'revoked' WHERE kiosk_member_id = ? AND status IN ('pending', 'approved')`, id)

	pairingToken, expiresAt, err := h.insertPairingToken(user.FamilyID, id, user.MemberID, name, "approved", "")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create pairing")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"id":           id,
		"name":         name,
		"pairingToken": pairingToken,
		"expiresAt":    expiresAt.Format(time.RFC3339),
	})
}

func (h *KioskHandler) Logout(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	id := chi.URLParam(r, "id")
	if !h.kioskInFamily(id, user.FamilyID) {
		writeError(w, http.StatusNotFound, "kiosk not found")
		return
	}

	auth.DeleteSessionsForMember(h.db, id)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *KioskHandler) Delete(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	id := chi.URLParam(r, "id")
	if !h.kioskInFamily(id, user.FamilyID) {
		writeError(w, http.StatusNotFound, "kiosk not found")
		return
	}

	h.db.Exec(`DELETE FROM kiosk_pairing_tokens WHERE kiosk_member_id = ?`, id)
	if _, err := h.db.Exec(`DELETE FROM family_members WHERE id = ? AND role = 'kiosk'`, id); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete kiosk")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *KioskHandler) StartPending(w http.ResponseWriter, r *http.Request) {
	var familyID string
	if err := h.db.QueryRow(`SELECT id FROM families LIMIT 1`).Scan(&familyID); err != nil {
		writeError(w, http.StatusBadRequest, "family is not set up yet")
		return
	}

	token, err := auth.RandomToken(32)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create pairing")
		return
	}
	pollSecret, err := auth.RandomToken(32)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create pairing")
		return
	}

	expiresAt := time.Now().Add(kioskPairingTTL)
	_, err = h.db.Exec(
		`INSERT INTO kiosk_pairing_tokens (id, token, family_id, status, poll_secret_hash, expires_at) VALUES (?, ?, ?, 'pending', ?, ?)`,
		uuid.New().String(), token, familyID, auth.HashSecret(pollSecret), expiresAt,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create pairing")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"token":      token,
		"pollSecret": pollSecret,
		"expiresAt":  expiresAt.Format(time.RFC3339),
	})
}

func (h *KioskHandler) PendingStatus(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	secret := r.URL.Query().Get("secret")
	if token == "" || secret == "" {
		writeError(w, http.StatusBadRequest, "token and secret are required")
		return
	}

	var status, pollHash, claimToken string
	var expiresAt time.Time
	err := h.db.QueryRow(
		`SELECT status, COALESCE(poll_secret_hash, ''), COALESCE(claim_token, ''), expires_at FROM kiosk_pairing_tokens WHERE token = ?`,
		token,
	).Scan(&status, &pollHash, &claimToken, &expiresAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "pairing not found")
		return
	}
	if !auth.CheckSecret(pollHash, secret) {
		writeError(w, http.StatusUnauthorized, "invalid secret")
		return
	}
	if time.Now().After(expiresAt) && status == "pending" {
		writeJSON(w, http.StatusOK, map[string]string{"status": "expired"})
		return
	}

	resp := map[string]string{"status": status}
	if status == "approved" {
		resp["claimToken"] = claimToken
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *KioskHandler) Approve(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var req struct {
		Token string `json:"token"`
		Name  string `json:"name"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Token == "" || req.Name == "" {
		writeError(w, http.StatusBadRequest, "token and name are required")
		return
	}

	var id, familyID, status string
	var expiresAt time.Time
	err := h.db.QueryRow(
		`SELECT id, family_id, status, expires_at FROM kiosk_pairing_tokens WHERE token = ?`,
		req.Token,
	).Scan(&id, &familyID, &status, &expiresAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "pairing not found")
		return
	}
	if familyID != user.FamilyID {
		writeError(w, http.StatusForbidden, "pairing belongs to another family")
		return
	}
	if status != "pending" {
		writeError(w, http.StatusBadRequest, "pairing is no longer pending")
		return
	}
	if time.Now().After(expiresAt) {
		writeError(w, http.StatusGone, "pairing has expired")
		return
	}

	memberID, err := h.insertKioskMember(user.FamilyID, req.Name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create kiosk")
		return
	}

	claimToken, err := auth.RandomToken(32)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to approve pairing")
		return
	}

	_, err = h.db.Exec(
		`UPDATE kiosk_pairing_tokens SET status = 'approved', kiosk_member_id = ?, created_by = ?, name = ?, claim_token = ?, claim_token_hash = ? WHERE id = ?`,
		memberID, user.MemberID, req.Name, claimToken, auth.HashSecret(claimToken), id,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to approve pairing")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "kioskId": memberID})
}

func (h *KioskHandler) Claim(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token      string `json:"token"`
		ClaimToken string `json:"claimToken"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	var pairingID, memberID, status string
	var expiresAt time.Time
	var err error

	if req.ClaimToken != "" {
		err = h.db.QueryRow(
			`SELECT id, COALESCE(kiosk_member_id, ''), status, expires_at FROM kiosk_pairing_tokens WHERE claim_token = ?`,
			req.ClaimToken,
		).Scan(&pairingID, &memberID, &status, &expiresAt)
	} else if req.Token != "" {
		err = h.db.QueryRow(
			`SELECT id, COALESCE(kiosk_member_id, ''), status, expires_at FROM kiosk_pairing_tokens WHERE token = ? AND COALESCE(claim_token, '') = ''`,
			req.Token,
		).Scan(&pairingID, &memberID, &status, &expiresAt)
	} else {
		writeError(w, http.StatusBadRequest, "token or claimToken is required")
		return
	}
	if err != nil {
		writeError(w, http.StatusNotFound, "pairing not found")
		return
	}
	if status == "claimed" {
		writeError(w, http.StatusConflict, "pairing already used")
		return
	}
	if status != "approved" {
		writeError(w, http.StatusBadRequest, "pairing is not ready")
		return
	}
	if time.Now().After(expiresAt) {
		writeError(w, http.StatusGone, "pairing has expired")
		return
	}
	if memberID == "" {
		writeError(w, http.StatusBadRequest, "kiosk is not ready")
		return
	}

	auth.DeleteSessionsForMember(h.db, memberID)

	sessionToken, err := auth.CreateSession(h.db, h.cfg.SessionSecret, memberID, "kiosk")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	h.db.Exec(`UPDATE sessions SET user_agent = ? WHERE token_hash = ?`, r.UserAgent(), auth.TokenHash(sessionToken))
	h.db.Exec(`UPDATE kiosk_pairing_tokens SET status = 'claimed', claim_token = '' WHERE id = ?`, pairingID)

	setSessionCookie(w, sessionToken, 10*365*24*time.Hour)

	var name, role, familyID, color string
	h.db.QueryRow(`SELECT name, role, family_id, color FROM family_members WHERE id = ?`, memberID).
		Scan(&name, &role, &familyID, &color)

	writeJSON(w, http.StatusOK, map[string]any{
		"memberId":    memberID,
		"name":        name,
		"role":        role,
		"familyId":    familyID,
		"color":       color,
		"sessionType": "kiosk",
	})
}

func (h *KioskHandler) insertKioskMember(familyID, name string) (string, error) {
	id := uuid.New().String()
	_, err := h.db.Exec(
		`INSERT INTO family_members (id, name, role, color, family_id) VALUES (?, ?, 'kiosk', ?, ?)`,
		id, name, kioskColor, familyID,
	)
	return id, err
}

func (h *KioskHandler) insertPairingToken(familyID, memberID, createdBy, name, status, pollSecretHash string) (string, time.Time, error) {
	token, err := auth.RandomToken(32)
	if err != nil {
		return "", time.Time{}, err
	}
	expiresAt := time.Now().Add(kioskPairingTTL)
	var kioskID any
	if memberID != "" {
		kioskID = memberID
	}
	_, err = h.db.Exec(
		`INSERT INTO kiosk_pairing_tokens (id, token, family_id, kiosk_member_id, created_by, name, status, poll_secret_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		uuid.New().String(), token, familyID, kioskID, createdBy, name, status, pollSecretHash, expiresAt,
	)
	return token, expiresAt, err
}

func (h *KioskHandler) kioskInFamily(id, familyID string) bool {
	var role, fid string
	err := h.db.QueryRow(`SELECT role, family_id FROM family_members WHERE id = ?`, id).Scan(&role, &fid)
	return err == nil && role == "kiosk" && fid == familyID
}
