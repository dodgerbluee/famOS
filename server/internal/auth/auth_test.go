package auth

import (
	"database/sql"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/sandershome/server/internal/db"
)

func TestValidateSessionDoesNotTouchLastSeenForUsers(t *testing.T) {
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	if err := database.Migrate(); err != nil {
		t.Fatal(err)
	}

	familyID := uuid.New().String()
	memberID := uuid.New().String()
	database.Exec(`INSERT INTO families (id, name) VALUES (?, 'Test')`, familyID)
	database.Exec(`INSERT INTO family_members (id, name, role, color, family_id, username, password_hash) VALUES (?, 'Greg', 'admin', '#89b4fa', ?, 'greg', 'hash')`, memberID, familyID)

	token, err := CreateSession(database, "secret", memberID, "user")
	if err != nil {
		t.Fatal(err)
	}
	database.Exec(`UPDATE sessions SET last_seen_at = NULL WHERE member_id = ?`, memberID)
	if _, err := ValidateSession(database, "secret", token); err != nil {
		t.Fatal(err)
	}

	var lastSeen sql.NullTime
	if err := database.QueryRow(`SELECT last_seen_at FROM sessions WHERE member_id = ?`, memberID).Scan(&lastSeen); err != nil {
		t.Fatal(err)
	}
	if lastSeen.Valid {
		t.Fatalf("user sessions should not update last_seen on every request, got %v", lastSeen.Time)
	}
}

func TestValidateSessionThrottlesKioskLastSeen(t *testing.T) {
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	if err := database.Migrate(); err != nil {
		t.Fatal(err)
	}

	familyID := uuid.New().String()
	memberID := uuid.New().String()
	database.Exec(`INSERT INTO families (id, name) VALUES (?, 'Test')`, familyID)
	database.Exec(`INSERT INTO family_members (id, name, role, color, family_id) VALUES (?, 'Kitchen', 'kiosk', '#89b4fa', ?)`, memberID, familyID)

	token, err := CreateSession(database, "secret", memberID, "kiosk")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ValidateSession(database, "secret", token); err != nil {
		t.Fatal(err)
	}

	var first sql.NullTime
	database.QueryRow(`SELECT last_seen_at FROM sessions WHERE member_id = ?`, memberID).Scan(&first)
	if !first.Valid {
		t.Fatal("kiosk last_seen should be set on first request")
	}

	time.Sleep(20 * time.Millisecond)
	if _, err := ValidateSession(database, "secret", token); err != nil {
		t.Fatal(err)
	}
	var second sql.NullTime
	database.QueryRow(`SELECT last_seen_at FROM sessions WHERE member_id = ?`, memberID).Scan(&second)
	if !second.Time.Equal(first.Time) {
		t.Fatalf("kiosk last_seen should be throttled, %v -> %v", first.Time, second.Time)
	}
}
