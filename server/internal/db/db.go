package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

type DB struct {
	*sql.DB
}

func New(path string) (*DB, error) {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	sqlDB, err := sql.Open("sqlite", path+"?_journal_mode=WAL&_busy_timeout=5000&_foreign_keys=ON")
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	if err := sqlDB.Ping(); err != nil {
		return nil, fmt.Errorf("ping database: %w", err)
	}

	return &DB{sqlDB}, nil
}

func (d *DB) Migrate() error {
	if _, err := d.Exec(schema); err != nil {
		return err
	}
	if _, err := d.Exec(`ALTER TABLE calendar_sources ADD COLUMN calendar_name TEXT DEFAULT ''`); err != nil {
		if err.Error() != "SQL logic error: duplicate column name: calendar_name (1)" {
			return err
		}
	}
	if _, err := d.Exec(`ALTER TABLE calendar_events ADD COLUMN calendar_name TEXT DEFAULT ''`); err != nil {
		if err.Error() != "SQL logic error: duplicate column name: calendar_name (1)" {
			return err
		}
	}
	if _, err := d.Exec(`ALTER TABLE calendar_events ADD COLUMN calendar_color TEXT DEFAULT ''`); err != nil {
		if err.Error() != "SQL logic error: duplicate column name: calendar_color (1)" {
			return err
		}
	}
	_, err := d.Exec(`DELETE FROM calendar_sources WHERE type = 'local'`)
	return err
}

var schema = `
CREATE TABLE IF NOT EXISTS family_members (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	role TEXT NOT NULL CHECK(role IN ('parent', 'kid')),
	avatar_url TEXT DEFAULT '',
	pin_hash TEXT DEFAULT '',
	color TEXT NOT NULL,
	sort_order INTEGER DEFAULT 0,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sanders_cash_accounts (
	id TEXT PRIMARY KEY,
	member_id TEXT NOT NULL UNIQUE REFERENCES family_members(id) ON DELETE CASCADE,
	balance INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sanders_cash_transactions (
	id TEXT PRIMARY KEY,
	account_id TEXT NOT NULL REFERENCES sanders_cash_accounts(id) ON DELETE CASCADE,
	amount INTEGER NOT NULL,
	type TEXT NOT NULL CHECK(type IN ('earn', 'spend', 'adjust')),
	reason TEXT NOT NULL,
	awarded_by TEXT REFERENCES family_members(id),
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rewards (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	description TEXT DEFAULT '',
	cost INTEGER NOT NULL,
	image_url TEXT DEFAULT '',
	category TEXT DEFAULT '',
	active BOOLEAN DEFAULT TRUE,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS redemptions (
	id TEXT PRIMARY KEY,
	reward_id TEXT NOT NULL REFERENCES rewards(id),
	member_id TEXT NOT NULL REFERENCES family_members(id),
	status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'denied')),
	requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	resolved_at DATETIME,
	resolved_by TEXT REFERENCES family_members(id)
);

CREATE TABLE IF NOT EXISTS calendar_sources (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	type TEXT NOT NULL CHECK(type IN ('caldav', 'ics_url', 'local')),
	url TEXT NOT NULL,
	calendar_name TEXT DEFAULT '',
	username TEXT DEFAULT '',
	password_encrypted TEXT DEFAULT '',
	color TEXT NOT NULL,
	sync_interval_min INTEGER DEFAULT 5,
	last_synced_at DATETIME,
	active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS calendar_events (
	id TEXT PRIMARY KEY,
	source_id TEXT NOT NULL REFERENCES calendar_sources(id) ON DELETE CASCADE,
	external_id TEXT NOT NULL,
	calendar_name TEXT DEFAULT '',
	calendar_color TEXT DEFAULT '',
	title TEXT NOT NULL,
	description TEXT DEFAULT '',
	location TEXT DEFAULT '',
	start_at DATETIME NOT NULL,
	end_at DATETIME NOT NULL,
	all_day BOOLEAN DEFAULT FALSE,
	recurrence_rule TEXT DEFAULT '',
	ai_enrichment TEXT DEFAULT '',
	synced_at DATETIME,
	UNIQUE(source_id, external_id)
);

CREATE TABLE IF NOT EXISTS ai_cache (
	id TEXT PRIMARY KEY,
	cache_key TEXT NOT NULL UNIQUE,
	content TEXT NOT NULL,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	expires_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_providers (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	url TEXT NOT NULL,
	api_key TEXT NOT NULL DEFAULT '',
	model TEXT NOT NULL DEFAULT '',
	active INTEGER NOT NULL DEFAULT 0,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS batch_runs (
	id TEXT PRIMARY KEY,
	job_name TEXT NOT NULL,
	status TEXT NOT NULL CHECK(status IN ('running', 'success', 'error')),
	result TEXT DEFAULT '',
	error_message TEXT DEFAULT '',
	started_at DATETIME NOT NULL,
	finished_at DATETIME,
	duration_ms INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chores (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	icon TEXT DEFAULT '',
	assigned_to TEXT REFERENCES family_members(id) ON DELETE SET NULL,
	recurrence TEXT NOT NULL DEFAULT 'daily' CHECK(recurrence IN ('daily', 'weekly', 'once')),
	reward_amount INTEGER NOT NULL DEFAULT 0,
	active BOOLEAN DEFAULT TRUE,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chore_completions (
	id TEXT PRIMARY KEY,
	chore_id TEXT NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
	completed_by TEXT NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
	date_key TEXT NOT NULL,
	completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	UNIQUE(chore_id, completed_by, date_key)
);
`
