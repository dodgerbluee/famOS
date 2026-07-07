package db

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

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

	// Calendar column migrations (existing)
	addColumnIfNotExists(d, "calendar_sources", "calendar_name", "TEXT DEFAULT ''")
	addColumnIfNotExists(d, "calendar_events", "calendar_name", "TEXT DEFAULT ''")
	addColumnIfNotExists(d, "calendar_events", "calendar_color", "TEXT DEFAULT ''")
	d.Exec(`DELETE FROM calendar_sources WHERE type = 'local'`)

	// Auth system migrations
	addColumnIfNotExists(d, "family_members", "family_id", "TEXT DEFAULT ''")
	addColumnIfNotExists(d, "family_members", "password_hash", "TEXT DEFAULT ''")
	// Rename email→username for DBs from previous migration, then add if neither existed
	renameColumnIfExists(d, "family_members", "email", "username")
	addColumnIfNotExists(d, "family_members", "username", "TEXT DEFAULT ''")

	// Create default family for existing members
	var memberCount int
	d.QueryRow(`SELECT COUNT(*) FROM family_members WHERE family_id = '' OR family_id IS NULL`).Scan(&memberCount)
	if memberCount > 0 {
		d.Exec(`INSERT OR IGNORE INTO families (id, name) VALUES ('default', 'Sanders Family')`)
		d.Exec(`UPDATE family_members SET family_id = 'default' WHERE family_id = '' OR family_id IS NULL`)
	}

	// Promote first parent to admin if no admin exists
	var adminCount int
	d.QueryRow(`SELECT COUNT(*) FROM family_members WHERE role = 'admin'`).Scan(&adminCount)
	if adminCount == 0 {
		d.Exec(`UPDATE family_members SET role = 'admin'
			WHERE id = (SELECT id FROM family_members WHERE role = 'parent' ORDER BY created_at LIMIT 1)`)
	}

	// Rebuild family_members if CHECK constraint needs expanding
	rebuildFamilyMembersIfNeeded(d)

	return nil
}

func rebuildFamilyMembersIfNeeded(d *DB) {
	_, err := d.Exec(`INSERT INTO family_members (id, name, role, color, family_id) VALUES ('__check_test__', 'test', 'admin', '#000', '')`)
	if err == nil {
		d.Exec(`DELETE FROM family_members WHERE id = '__check_test__'`)
		return
	}
	if !strings.Contains(err.Error(), "CHECK") {
		return
	}

	log.Println("rebuilding family_members table for expanded role CHECK constraint")

	d.Exec(`PRAGMA foreign_keys = OFF`)
	tx, err := d.Begin()
	if err != nil {
		log.Printf("migration: failed to begin transaction: %v", err)
		d.Exec(`PRAGMA foreign_keys = ON`)
		return
	}

	tx.Exec(`CREATE TABLE family_members_new (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		role TEXT NOT NULL CHECK(role IN ('admin', 'parent', 'kid', 'kiosk')),
		avatar_url TEXT DEFAULT '',
		pin_hash TEXT DEFAULT '',
		color TEXT NOT NULL,
		sort_order INTEGER DEFAULT 0,
		family_id TEXT DEFAULT '' REFERENCES families(id),
		username TEXT DEFAULT '',
		password_hash TEXT DEFAULT '',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`)
	tx.Exec(`INSERT INTO family_members_new
		SELECT id, name, role, avatar_url, pin_hash, color, sort_order,
			COALESCE(family_id, ''), COALESCE(username, ''), COALESCE(password_hash, ''), created_at
		FROM family_members`)
	tx.Exec(`DROP TABLE family_members`)
	tx.Exec(`ALTER TABLE family_members_new RENAME TO family_members`)

	if err := tx.Commit(); err != nil {
		log.Printf("migration: failed to rebuild family_members: %v", err)
	}
	d.Exec(`PRAGMA foreign_keys = ON`)
}

func addColumnIfNotExists(d *DB, table, column, definition string) {
	_, err := d.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, column, definition))
	if err != nil && !strings.Contains(err.Error(), "duplicate column name") {
		log.Printf("migration warning: %v", err)
	}
}

func renameColumnIfExists(d *DB, table, oldCol, newCol string) {
	rows, err := d.Query(fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return
	}
	defer rows.Close()
	hasOld, hasNew := false, false
	for rows.Next() {
		var cid int
		var name, colType string
		var notNull int
		var dflt sql.NullString
		var pk int
		if rows.Scan(&cid, &name, &colType, &notNull, &dflt, &pk) == nil {
			if name == oldCol {
				hasOld = true
			}
			if name == newCol {
				hasNew = true
			}
		}
	}
	if hasOld && !hasNew {
		d.Exec(fmt.Sprintf("ALTER TABLE %s RENAME COLUMN %s TO %s", table, oldCol, newCol))
	} else if hasOld && hasNew {
		// Both exist from a broken migration — copy data from old to new where new is empty
		d.Exec(fmt.Sprintf("UPDATE %s SET %s = %s WHERE (%s = '' OR %s IS NULL) AND %s != ''",
			table, newCol, oldCol, newCol, newCol, oldCol))
	}
}

var schema = `
CREATE TABLE IF NOT EXISTS families (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS family_members (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	role TEXT NOT NULL CHECK(role IN ('admin', 'parent', 'kid', 'kiosk')),
	avatar_url TEXT DEFAULT '',
	pin_hash TEXT DEFAULT '',
	color TEXT NOT NULL,
	sort_order INTEGER DEFAULT 0,
	family_id TEXT DEFAULT '' REFERENCES families(id),
	username TEXT DEFAULT '',
	password_hash TEXT DEFAULT '',
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
	id TEXT PRIMARY KEY,
	member_id TEXT NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
	token_hash TEXT NOT NULL UNIQUE,
	session_type TEXT NOT NULL DEFAULT 'user' CHECK(session_type IN ('user', 'kiosk')),
	expires_at DATETIME NOT NULL,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invite_links (
	id TEXT PRIMARY KEY,
	token TEXT NOT NULL UNIQUE,
	family_id TEXT NOT NULL REFERENCES families(id),
	role TEXT NOT NULL CHECK(role IN ('admin', 'parent', 'kid')),
	created_by TEXT NOT NULL REFERENCES family_members(id),
	expires_at DATETIME NOT NULL,
	used_by TEXT REFERENCES family_members(id),
	used_at DATETIME,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permission_overrides (
	id TEXT PRIMARY KEY,
	member_id TEXT NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
	permission TEXT NOT NULL,
	allowed BOOLEAN NOT NULL,
	UNIQUE(member_id, permission)
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
