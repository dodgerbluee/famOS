package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/sandershome/server/internal/db"
	"golang.org/x/crypto/bcrypt"
)

type contextKey string

const userContextKey contextKey = "auth_user"

type UserInfo struct {
	MemberID    string
	FamilyID    string
	Name        string
	Role        string
	Color       string
	Username       string
	SessionType string
	Overrides   map[string]bool
}

func UserFromContext(ctx context.Context) *UserInfo {
	if u, ok := ctx.Value(userContextKey).(*UserInfo); ok {
		return u
	}
	return nil
}

func WithUser(ctx context.Context, u *UserInfo) context.Context {
	return context.WithValue(ctx, userContextKey, u)
}

func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func HashPin(pin string) (string, error) {
	return HashPassword(pin)
}

func CheckPin(hash, pin string) bool {
	return CheckPassword(hash, pin)
}

func GenerateToken(secret, memberID string) string {
	tokenBytes := make([]byte, 32)
	rand.Read(tokenBytes)
	raw := hex.EncodeToString(tokenBytes)

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(memberID + ":" + raw))
	sig := hex.EncodeToString(mac.Sum(nil))

	return memberID + ":" + raw + ":" + sig
}

func ValidateToken(secret, token string) (string, bool) {
	parts := splitToken(token)
	if parts == nil {
		return "", false
	}

	memberID, raw, sig := parts[0], parts[1], parts[2]

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(memberID + ":" + raw))
	expected := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(sig), []byte(expected)) {
		return "", false
	}

	return memberID, true
}

func TokenHash(token string) string {
	parts := splitToken(token)
	if parts == nil {
		return ""
	}
	h := sha256.Sum256([]byte(parts[0] + ":" + parts[1]))
	return hex.EncodeToString(h[:])
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

func CreateSession(database *db.DB, secret, memberID, sessionType string) (string, error) {
	token := GenerateToken(secret, memberID)
	hash := TokenHash(token)

	expiry := 30 * 24 * time.Hour
	if sessionType == "kiosk" {
		expiry = 10 * 365 * 24 * time.Hour
	}

	_, err := database.Exec(
		`INSERT INTO sessions (id, member_id, token_hash, session_type, expires_at) VALUES (?, ?, ?, ?, ?)`,
		uuid.New().String(), memberID, hash, sessionType, time.Now().Add(expiry),
	)
	if err != nil {
		return "", fmt.Errorf("create session: %w", err)
	}
	return token, nil
}

func ValidateSession(database *db.DB, secret, token string) (*UserInfo, error) {
	memberID, valid := ValidateToken(secret, token)
	if !valid {
		return nil, fmt.Errorf("invalid token signature")
	}

	hash := TokenHash(token)

	var sessionType string
	var expiresAt time.Time
	err := database.QueryRow(
		`SELECT session_type, expires_at FROM sessions WHERE token_hash = ? AND member_id = ?`,
		hash, memberID,
	).Scan(&sessionType, &expiresAt)
	if err != nil {
		return nil, fmt.Errorf("session not found")
	}
	if time.Now().After(expiresAt) {
		database.Exec(`DELETE FROM sessions WHERE token_hash = ?`, hash)
		return nil, fmt.Errorf("session expired")
	}

	var name, role, familyID, color, username string
	err = database.QueryRow(
		`SELECT name, role, family_id, color, COALESCE(username, '') FROM family_members WHERE id = ?`,
		memberID,
	).Scan(&name, &role, &familyID, &color, &username)
	if err != nil {
		return nil, fmt.Errorf("member not found")
	}

	overrides := loadOverrides(database, memberID)

	return &UserInfo{
		MemberID:    memberID,
		FamilyID:    familyID,
		Name:        name,
		Role:        role,
		Color:       color,
		Username:    username,
		SessionType: sessionType,
		Overrides:   overrides,
	}, nil
}

func DeleteSession(database *db.DB, tokenHash string) {
	database.Exec(`DELETE FROM sessions WHERE token_hash = ?`, tokenHash)
}

func CleanExpiredSessions(database *db.DB) {
	database.Exec(`DELETE FROM sessions WHERE expires_at < ?`, time.Now())
}

func loadOverrides(database *db.DB, memberID string) map[string]bool {
	overrides := make(map[string]bool)
	rows, err := database.Query(
		`SELECT permission, allowed FROM permission_overrides WHERE member_id = ?`, memberID,
	)
	if err != nil {
		return overrides
	}
	defer rows.Close()
	for rows.Next() {
		var perm string
		var allowed bool
		if rows.Scan(&perm, &allowed) == nil {
			overrides[perm] = allowed
		}
	}
	return overrides
}

func NeedsSetup(database *db.DB) bool {
	var count int
	err := database.QueryRow(`SELECT COUNT(*) FROM families`).Scan(&count)
	if err != nil {
		// Table might not exist yet on very first run
		return true
	}
	return count == 0
}

func FindMemberByUsername(database *db.DB, username string) (id, passwordHash, role string, err error) {
	err = database.QueryRow(
		`SELECT id, password_hash, role FROM family_members WHERE username = ?`, username,
	).Scan(&id, &passwordHash, &role)
	if err == sql.ErrNoRows {
		return "", "", "", fmt.Errorf("member not found")
	}
	return
}
