package api

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"time"

	"github.com/sandershome/server/internal/config"
	"github.com/sandershome/server/internal/db"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	db  *db.DB
	cfg *config.Config
}

func hashPin(pin string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(pin), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func checkPin(hash, pin string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pin)) == nil
}

func (h *AuthHandler) generateToken(memberID string) string {
	tokenBytes := make([]byte, 32)
	rand.Read(tokenBytes)
	raw := hex.EncodeToString(tokenBytes)

	mac := hmac.New(sha256.New, []byte(h.cfg.SessionSecret))
	mac.Write([]byte(memberID + ":" + raw))
	sig := hex.EncodeToString(mac.Sum(nil))

	return memberID + ":" + raw + ":" + sig
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MemberID string `json:"memberId"`
		Pin      string `json:"pin"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	var pinHash string
	var role string
	err := h.db.QueryRow(`SELECT pin_hash, role FROM family_members WHERE id = ?`, req.MemberID).Scan(&pinHash, &role)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	if pinHash == "" {
		writeError(w, http.StatusUnauthorized, "no pin set for this member")
		return
	}

	if !checkPin(pinHash, req.Pin) {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	token := h.generateToken(req.MemberID)

	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(24 * time.Hour / time.Second),
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"role":  role,
	})
}

func (h *AuthHandler) Verify(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token string `json:"token"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	memberID, valid := h.validateToken(req.Token)
	if !valid {
		writeError(w, http.StatusUnauthorized, "invalid token")
		return
	}

	var role string
	err := h.db.QueryRow(`SELECT role FROM family_members WHERE id = ?`, memberID).Scan(&role)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "member not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"memberId": memberID,
		"role":     role,
		"valid":    true,
	})
}

func (h *AuthHandler) validateToken(token string) (string, bool) {
	parts := splitToken(token)
	if parts == nil {
		return "", false
	}

	memberID, raw, sig := parts[0], parts[1], parts[2]

	mac := hmac.New(sha256.New, []byte(h.cfg.SessionSecret))
	mac.Write([]byte(memberID + ":" + raw))
	expected := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(sig), []byte(expected)) {
		return "", false
	}

	return memberID, true
}

func splitToken(token string) []string {
	var parts []string
	start := 0
	count := 0
	for i, c := range token {
		if c == ':' {
			parts = append(parts, token[start:i])
			start = i + 1
			count++
			if count == 2 {
				parts = append(parts, token[start:])
				return parts
			}
		}
	}
	return nil
}
