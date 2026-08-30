package auth

import (
	"testing"

	"github.com/sandershome/server/internal/db"
)

func TestNeedsSetup_FalseWhenHouseholdMembersExistWithoutFamiliesRow(t *testing.T) {
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	if err := database.Migrate(); err != nil {
		t.Fatal(err)
	}

	if _, err := database.Exec(`PRAGMA foreign_keys = OFF`); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(`DELETE FROM families`); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(`INSERT INTO family_members (id, name, role, color, username, password_hash) VALUES ('m1', 'Greg', 'admin', '#89b4fa', 'greg', 'hashed')`); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(`PRAGMA foreign_keys = ON`); err != nil {
		t.Fatal(err)
	}

	if NeedsSetup(database) {
		t.Fatal("existing household with members must not be sent through first-run setup")
	}
}

func TestNeedsSetup_FalseWhenQueryFails(t *testing.T) {
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	database.Close()

	if NeedsSetup(database) {
		t.Fatal("a database error must not look like first-run setup")
	}
}

func TestNeedsSetup_TrueWhenNoPeople(t *testing.T) {
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	if err := database.Migrate(); err != nil {
		t.Fatal(err)
	}

	if !NeedsSetup(database) {
		t.Fatal("empty database should need setup")
	}
}

func TestMigrate_BackfillsFamilyForOrphanMembers(t *testing.T) {
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	if err := database.Migrate(); err != nil {
		t.Fatal(err)
	}

	if _, err := database.Exec(`PRAGMA foreign_keys = OFF`); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(`DELETE FROM families`); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(`INSERT INTO family_members (id, name, role, color, family_id, username, password_hash) VALUES ('m1', 'Greg', 'admin', '#89b4fa', 'orphan-fam', 'greg', 'hashed')`); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(`PRAGMA foreign_keys = ON`); err != nil {
		t.Fatal(err)
	}

	if err := database.Migrate(); err != nil {
		t.Fatal(err)
	}

	var families int
	if err := database.QueryRow(`SELECT COUNT(*) FROM families`).Scan(&families); err != nil {
		t.Fatal(err)
	}
	if families == 0 {
		t.Fatal("migrate should create a families row for existing members")
	}

	var familyID string
	if err := database.QueryRow(`SELECT family_id FROM family_members WHERE id = 'm1'`).Scan(&familyID); err != nil {
		t.Fatal(err)
	}
	if familyID == "" {
		t.Fatal("member should keep or receive a family_id")
	}

	var name string
	err = database.QueryRow(`SELECT name FROM families WHERE id = ?`, familyID).Scan(&name)
	if err != nil {
		t.Fatalf("member family_id %q has no families row: %v", familyID, err)
	}
}
