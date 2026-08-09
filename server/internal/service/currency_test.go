package service

import (
	"testing"

	"github.com/sandershome/server/internal/db"
)

func setupCurrencyTest(t *testing.T) (*CurrencyService, *db.DB) {
	t.Helper()
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Migrate(); err != nil {
		t.Fatal(err)
	}

	database.Exec(`INSERT INTO families (id, name) VALUES ('fam1', 'Sanders')`)

	svc := NewCurrencyService(database)
	t.Cleanup(func() { database.Close() })
	return svc, database
}

func TestCurrencyName_DefaultDerivedFromFamilyName(t *testing.T) {
	svc, _ := setupCurrencyTest(t)

	name := svc.GetCurrencyName()
	if name != "Sanders Cash" {
		t.Errorf("expected 'Sanders Cash', got %q", name)
	}
}

func TestCurrencyName_CustomOverride(t *testing.T) {
	svc, database := setupCurrencyTest(t)

	database.Exec(`INSERT INTO app_settings (key, value) VALUES ('currency_name', '"Gold Coins"')`)

	name := svc.GetCurrencyName()
	if name != "Gold Coins" {
		t.Errorf("expected 'Gold Coins', got %q", name)
	}
}

func TestCurrencyName_FallbackWhenNoFamily(t *testing.T) {
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Migrate(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })

	svc := NewCurrencyService(database)
	name := svc.GetCurrencyName()
	if name != "Family Cash" {
		t.Errorf("expected 'Family Cash' as fallback, got %q", name)
	}
}
