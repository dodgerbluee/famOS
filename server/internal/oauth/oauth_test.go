package oauth

import (
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/sandershome/server/internal/auth"
	"github.com/sandershome/server/internal/db"
)

func testDB(t *testing.T) *db.DB {
	t.Helper()
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Migrate(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	return database
}

func TestPKCEChallengeS256(t *testing.T) {
	verifier, challenge, err := GeneratePKCE()
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256([]byte(verifier))
	want := base64.RawURLEncoding.EncodeToString(sum[:])
	if challenge != want {
		t.Fatalf("challenge = %s, want %s", challenge, want)
	}
}

func TestSanitizeUsername(t *testing.T) {
	got := SanitizeUsername("Greg Sanders!")
	if got != "Greg_Sanders" {
		t.Fatalf("got %q", got)
	}
	if SanitizeUsername("ab") != "ab_" {
		t.Fatalf("short username: %q", SanitizeUsername("ab"))
	}
}

func TestConsumeStateOnce(t *testing.T) {
	database := testDB(t)
	if err := CreateState(database, "s1", "ver", "nonce", "http://localhost/cb", "authentik"); err != nil {
		t.Fatal(err)
	}
	first, err := ConsumeState(database, "s1")
	if err != nil || first == nil {
		t.Fatalf("first consume: %v %#v", err, first)
	}
	if first.CodeVerifier != "ver" || first.Nonce != "nonce" || first.ProviderName != "authentik" {
		t.Fatalf("stored %+v", first)
	}
	second, err := ConsumeState(database, "s1")
	if err != nil {
		t.Fatal(err)
	}
	if second != nil {
		t.Fatal("state should be single-use")
	}
}

func TestResolveLinkedOAuthID(t *testing.T) {
	database := testDB(t)
	familyID := seedFamily(t, database)
	id := uuid.New().String()
	database.Exec(`INSERT INTO family_members (id, name, role, color, family_id, username, password_hash, oauth_provider, oauth_provider_id)
		VALUES (?, 'Greg', 'admin', '#89b4fa', ?, 'greg', 'hash', 'authentik', 'sub-1')`, id, familyID)

	member, created, err := ResolveUser(database, "authentik", NormalizedUser{ID: "sub-1", Username: "greg"}, false)
	if err != nil || created || member == nil || member.ID != id {
		t.Fatalf("got member=%v created=%v err=%v", member, created, err)
	}
}

func TestResolveUsernameWithPasswordRequiresLink(t *testing.T) {
	database := testDB(t)
	familyID := seedFamily(t, database)
	id := uuid.New().String()
	database.Exec(`INSERT INTO family_members (id, name, role, color, family_id, username, password_hash)
		VALUES (?, 'Greg', 'admin', '#89b4fa', ?, 'greg', 'hashed')`, id, familyID)

	_, _, err := ResolveUser(database, "authentik", NormalizedUser{ID: "sub-9", Username: "Greg"}, true)
	var linkErr *LinkRequiredError
	if !errors.As(err, &linkErr) || linkErr.MemberID != id {
		t.Fatalf("want link required, got %v", err)
	}
}

func TestResolveUsernameSilentLinkWithoutPassword(t *testing.T) {
	database := testDB(t)
	familyID := seedFamily(t, database)
	id := uuid.New().String()
	database.Exec(`INSERT INTO family_members (id, name, role, color, family_id, username, password_hash)
		VALUES (?, 'Greg', 'parent', '#89b4fa', ?, 'greg', '')`, id, familyID)

	member, created, err := ResolveUser(database, "authentik", NormalizedUser{ID: "sub-2", Username: "greg"}, false)
	if err != nil || created || member.ID != id {
		t.Fatalf("got %+v created=%v err=%v", member, created, err)
	}
	if member.OAuthProvider != "authentik" || member.OAuthProviderID != "sub-2" {
		t.Fatalf("not linked: %+v", member)
	}
}

func TestResolveSkipsKioskUsername(t *testing.T) {
	database := testDB(t)
	familyID := seedFamily(t, database)
	database.Exec(`INSERT INTO family_members (id, name, role, color, family_id, username)
		VALUES (?, 'Kitchen', 'kiosk', '#89b4fa', ?, 'greg')`, uuid.New().String(), familyID)

	_, _, err := ResolveUser(database, "authentik", NormalizedUser{ID: "sub-3", Username: "greg"}, false)
	if !errors.Is(err, ErrNoAccount) {
		t.Fatalf("want no account (kiosk ignored), got %v", err)
	}
}

func TestResolveAutoRegister(t *testing.T) {
	database := testDB(t)
	familyID := seedFamily(t, database)

	member, created, err := ResolveUser(database, "authentik", NormalizedUser{ID: "sub-4", Username: "alex", DisplayName: "Alex"}, true)
	if err != nil || !created || member == nil {
		t.Fatalf("got %+v created=%v err=%v", member, created, err)
	}
	if member.Role != "parent" || member.FamilyID != familyID || member.Username != "alex" {
		t.Fatalf("created %+v", member)
	}
}

func TestResolveAutoRegisterDisabled(t *testing.T) {
	database := testDB(t)
	seedFamily(t, database)
	_, _, err := ResolveUser(database, "authentik", NormalizedUser{ID: "sub-5", Username: "alex"}, false)
	if !errors.Is(err, ErrNoAccount) {
		t.Fatalf("got %v", err)
	}
}

func TestNeedsSetupUnchangedByOAuthTables(t *testing.T) {
	database := testDB(t)
	if !auth.NeedsSetup(database) {
		t.Fatal("empty household should need setup")
	}
	seedFamily(t, database)
	if !auth.NeedsSetup(database) {
		t.Fatal("family row without people should still need setup")
	}
}

func TestNormalizeAuthentikFallback(t *testing.T) {
	user, err := NormalizeUser("authentik", map[string]any{"sub": "abc123456"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if user.Username != "authentik_abc12345" {
		t.Fatalf("username %q", user.Username)
	}
}

func seedFamily(t *testing.T, database *db.DB) string {
	t.Helper()
	id := uuid.New().String()
	if _, err := database.Exec(`INSERT INTO families (id, name) VALUES (?, 'Test')`, id); err != nil {
		t.Fatal(err)
	}
	return id
}
