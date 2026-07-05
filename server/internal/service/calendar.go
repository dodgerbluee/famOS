package service

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/sandershome/server/internal/caldav"
	"github.com/sandershome/server/internal/db"
)

type CalendarService struct {
	db     *db.DB
	client *caldav.CalDAVClient
}

func NewCalendarService(database *db.DB, location *time.Location) *CalendarService {
	return &CalendarService{
		db:     database,
		client: caldav.NewCalDAVClient(location),
	}
}

type CalendarSource struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Type            string `json:"type"`
	URL             string `json:"url"`
	CalendarName    string `json:"calendarName"`
	Username        string `json:"username"`
	Color           string `json:"color"`
	SyncIntervalMin int    `json:"syncIntervalMin"`
	LastSyncedAt    string `json:"lastSyncedAt"`
	Active          bool   `json:"active"`
}

type CalendarEvent struct {
	ID                 string `json:"id"`
	SourceID           string `json:"sourceId"`
	ExternalID         string `json:"externalId"`
	Title              string `json:"title"`
	Description        string `json:"description"`
	Location           string `json:"location"`
	StartAt            string `json:"startAt"`
	EndAt              string `json:"endAt"`
	AllDay             bool   `json:"allDay"`
	RecurrenceRule     string `json:"recurrenceRule"`
	AIEnrichment       string `json:"aiEnrichment"`
	SourceColor        string `json:"sourceColor"`
	SourceName         string `json:"sourceName"`
	SourceCalendarName string `json:"sourceCalendarName"`
}

type RemoteCalendar = caldav.RemoteCalendar

func (s *CalendarService) ListSources() ([]CalendarSource, error) {
	rows, err := s.db.Query(`
		SELECT id, name, type, url, calendar_name, username, color, sync_interval_min,
		       COALESCE(last_synced_at, ''), active
		FROM calendar_sources ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sources []CalendarSource
	for rows.Next() {
		var src CalendarSource
		if err := rows.Scan(&src.ID, &src.Name, &src.Type, &src.URL, &src.CalendarName, &src.Username,
			&src.Color, &src.SyncIntervalMin, &src.LastSyncedAt, &src.Active); err != nil {
			return nil, err
		}
		sources = append(sources, src)
	}
	for i := range sources {
		if sources[i].Type != "caldav" || !sources[i].Active {
			continue
		}
		calendars, err := s.client.ListCalendars(context.Background(), sources[i].URL, sources[i].Username, getSourcePassword(s.db, sources[i].ID))
		if err != nil {
			continue
		}
		for _, calendar := range calendars {
			if (sources[i].CalendarName != "" && calendar.Name == sources[i].CalendarName) || strings.TrimRight(calendar.Path, "/") == strings.TrimRight(sources[i].URL, "/") {
				if calendar.Color != "" {
					sources[i].Color = calendar.Color
				}
				if calendar.Name != "" {
					sources[i].CalendarName = calendar.Name
				}
				break
			}
		}
	}
	return sources, nil
}

func (s *CalendarService) CreateSource(name, srcType, url, calendarName, username, password, color string, syncInterval int) (*CalendarSource, error) {
	if syncInterval <= 0 {
		syncInterval = 5
	}
	id := uuid.New().String()
	_, err := s.db.Exec(`
		INSERT INTO calendar_sources (id, name, type, url, calendar_name, username, password_encrypted, color, sync_interval_min)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, id, name, srcType, url, calendarName, username, password, color, syncInterval)
	if err != nil {
		return nil, err
	}
	return &CalendarSource{
		ID: id, Name: name, Type: srcType, URL: url, CalendarName: calendarName, Username: username,
		Color: color, SyncIntervalMin: syncInterval, Active: true,
	}, nil
}

func (s *CalendarService) UpdateSource(id string, name, srcType, url, calendarName, username, password, color *string, active *bool, syncInterval *int) error {
	if name != nil {
		if _, err := s.db.Exec(`UPDATE calendar_sources SET name = ? WHERE id = ?`, *name, id); err != nil {
			return err
		}
	}
	if srcType != nil {
		if _, err := s.db.Exec(`UPDATE calendar_sources SET type = ? WHERE id = ?`, *srcType, id); err != nil {
			return err
		}
	}
	if url != nil {
		if _, err := s.db.Exec(`UPDATE calendar_sources SET url = ? WHERE id = ?`, *url, id); err != nil {
			return err
		}
	}
	if calendarName != nil {
		if _, err := s.db.Exec(`UPDATE calendar_sources SET calendar_name = ? WHERE id = ?`, *calendarName, id); err != nil {
			return err
		}
	}
	if username != nil {
		if _, err := s.db.Exec(`UPDATE calendar_sources SET username = ? WHERE id = ?`, *username, id); err != nil {
			return err
		}
	}
	if password != nil {
		if _, err := s.db.Exec(`UPDATE calendar_sources SET password_encrypted = ? WHERE id = ?`, *password, id); err != nil {
			return err
		}
	}
	if color != nil {
		if _, err := s.db.Exec(`UPDATE calendar_sources SET color = ? WHERE id = ?`, *color, id); err != nil {
			return err
		}
	}
	if active != nil {
		if _, err := s.db.Exec(`UPDATE calendar_sources SET active = ? WHERE id = ?`, *active, id); err != nil {
			return err
		}
	}
	if syncInterval != nil {
		if _, err := s.db.Exec(`UPDATE calendar_sources SET sync_interval_min = ? WHERE id = ?`, *syncInterval, id); err != nil {
			return err
		}
	}
	return nil
}

func (s *CalendarService) DeleteSource(id string) error {
	_, err := s.db.Exec(`DELETE FROM calendar_sources WHERE id = ?`, id)
	return err
}

func (s *CalendarService) ListRemoteCalendars(ctx context.Context, sourceID string) ([]RemoteCalendar, error) {
	var src struct {
		Type     string
		URL      string
		Username string
		Password string
	}
	err := s.db.QueryRow(`SELECT type, url, username, password_encrypted FROM calendar_sources WHERE id = ?`, sourceID).
		Scan(&src.Type, &src.URL, &src.Username, &src.Password)
	if err != nil {
		return nil, err
	}
	if src.Type != "caldav" {
		return nil, fmt.Errorf("selected source is not a CalDAV calendar")
	}
	return s.client.ListCalendars(ctx, src.URL, src.Username, src.Password)
}

func getSourcePassword(database *db.DB, sourceID string) string {
	var password string
	_ = database.QueryRow(`SELECT password_encrypted FROM calendar_sources WHERE id = ?`, sourceID).Scan(&password)
	return password
}

func (s *CalendarService) GetEvents(start, end time.Time) ([]CalendarEvent, error) {
	rows, err := s.db.Query(`
		SELECT e.id, e.source_id, e.external_id, e.title, e.description, e.location,
		       e.start_at, e.end_at, e.all_day, e.recurrence_rule, e.ai_enrichment,
		       COALESCE(NULLIF(e.calendar_color, ''), cs.color), cs.name, COALESCE(NULLIF(e.calendar_name, ''), cs.calendar_name)
		FROM calendar_events e
		JOIN calendar_sources cs ON cs.id = e.source_id
		WHERE e.start_at <= ? AND e.end_at >= ?
		ORDER BY e.start_at
	`, end.Format(time.RFC3339), start.Format(time.RFC3339))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []CalendarEvent
	for rows.Next() {
		var ev CalendarEvent
		if err := rows.Scan(&ev.ID, &ev.SourceID, &ev.ExternalID, &ev.Title, &ev.Description,
			&ev.Location, &ev.StartAt, &ev.EndAt, &ev.AllDay, &ev.RecurrenceRule,
			&ev.AIEnrichment, &ev.SourceColor, &ev.SourceName, &ev.SourceCalendarName); err != nil {
			return nil, err
		}
		events = append(events, ev)
	}
	return events, nil
}

func (s *CalendarService) SyncSource(ctx context.Context, sourceID string) (int, error) {
	var src struct {
		CalendarName string
		Name         string
		Type         string
		URL          string
		Username     string
		Password     string
	}
	err := s.db.QueryRow(`SELECT name, type, url, calendar_name, username, password_encrypted FROM calendar_sources WHERE id = ?`, sourceID).
		Scan(&src.Name, &src.Type, &src.URL, &src.CalendarName, &src.Username, &src.Password)
	if err != nil {
		return 0, err
	}

	var events []caldav.ParsedEvent
	switch src.Type {
	case "caldav":
		events, err = s.client.FetchCalDAV(ctx, src.URL, src.Username, src.Password, src.CalendarName, src.Name)
	case "ics_url":
		events, err = s.client.FetchICSURL(ctx, src.URL)
	default:
		return 0, nil
	}
	if err != nil {
		return 0, err
	}

	count := 0
	if src.Type == "caldav" {
		_ = s.syncResolvedCalendarMetadata(sourceID, src.URL, src.Username, src.Password, src.CalendarName, src.Name)
	}
	for _, ev := range events {
		err := s.upsertEvent(sourceID, ev)
		if err != nil {
			log.Printf("upsert event %s: %v", ev.UID, err)
			continue
		}
		count++
	}

	s.db.Exec(`UPDATE calendar_sources SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ?`, sourceID)
	return count, nil
}

func (s *CalendarService) upsertEvent(sourceID string, ev caldav.ParsedEvent) error {
	var existingID string
	err := s.db.QueryRow(`SELECT id FROM calendar_events WHERE source_id = ? AND external_id = ?`,
		sourceID, ev.UID).Scan(&existingID)

	if err == sql.ErrNoRows {
		id := uuid.New().String()
		_, err = s.db.Exec(`
			INSERT INTO calendar_events (id, source_id, external_id, calendar_name, calendar_color, title, description, location,
				start_at, end_at, all_day, recurrence_rule, synced_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		`, id, sourceID, ev.UID, ev.CalendarName, ev.CalendarColor, ev.Summary, ev.Description, ev.Location,
			ev.StartAt.Format(time.RFC3339), ev.EndAt.Format(time.RFC3339),
			ev.AllDay, ev.RecurrenceRule)
		return err
	}
	if err != nil {
		return err
	}

	_, err = s.db.Exec(`
		UPDATE calendar_events SET calendar_name = ?, calendar_color = ?, title = ?, description = ?, location = ?,
			start_at = ?, end_at = ?, all_day = ?, recurrence_rule = ?, synced_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, ev.CalendarName, ev.CalendarColor, ev.Summary, ev.Description, ev.Location,
		ev.StartAt.Format(time.RFC3339), ev.EndAt.Format(time.RFC3339),
		ev.AllDay, ev.RecurrenceRule, existingID)
	return err
}

func (s *CalendarService) CreateEvent(ctx context.Context, sourceID, calendarName, title, description, location string, startAt, endAt time.Time, allDay bool) (*CalendarEvent, error) {
	var src struct {
		CalendarName string
		Type         string
		URL          string
		Username     string
		Password     string
		Color        string
		Name         string
		Active       bool
	}
	err := s.db.QueryRow(`SELECT calendar_name, type, url, username, password_encrypted, color, name, active FROM calendar_sources WHERE id = ?`, sourceID).
		Scan(&src.CalendarName, &src.Type, &src.URL, &src.Username, &src.Password, &src.Color, &src.Name, &src.Active)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("calendar source not found")
		}
		return nil, err
	}
	if !src.Active {
		return nil, fmt.Errorf("selected calendar is inactive")
	}
	if src.Type != "caldav" {
		return nil, fmt.Errorf("selected calendar is read-only")
	}

	targetCalendarName := src.CalendarName
	if strings.TrimSpace(calendarName) != "" {
		targetCalendarName = strings.TrimSpace(calendarName)
	}
	_ = s.syncResolvedCalendarMetadata(sourceID, src.URL, src.Username, src.Password, targetCalendarName, src.Name)

	parsed, err := s.client.CreateCalDAVEvent(ctx, src.URL, src.Username, src.Password, targetCalendarName, src.Name, title, description, location, startAt, endAt, allDay)
	if err != nil {
		return nil, err
	}

	if err := s.upsertEvent(sourceID, parsed); err != nil {
		return nil, err
	}

	var ev CalendarEvent
	err = s.db.QueryRow(`
		SELECT e.id, e.source_id, e.external_id, e.title, e.description, e.location,
		       e.start_at, e.end_at, e.all_day, e.recurrence_rule, e.ai_enrichment,
		       COALESCE(NULLIF(e.calendar_color, ''), cs.color), cs.name, COALESCE(NULLIF(e.calendar_name, ''), cs.calendar_name)
		FROM calendar_events e
		JOIN calendar_sources cs ON cs.id = e.source_id
		WHERE e.source_id = ? AND e.external_id = ?
	`, sourceID, parsed.UID).Scan(
		&ev.ID, &ev.SourceID, &ev.ExternalID, &ev.Title, &ev.Description, &ev.Location,
		&ev.StartAt, &ev.EndAt, &ev.AllDay, &ev.RecurrenceRule, &ev.AIEnrichment,
		&ev.SourceColor, &ev.SourceName, &ev.SourceCalendarName,
	)
	if err != nil {
		return nil, err
	}
	return &ev, nil
}

func (s *CalendarService) syncResolvedCalendarMetadata(sourceID, endpoint, username, password, calendarName, sourceName string) error {
	calendars, err := s.client.ListCalendars(context.Background(), endpoint, username, password)
	if err != nil {
		return err
	}
	for _, calendar := range calendars {
		if (calendarName != "" && calendar.Name == calendarName) || (calendarName == "" && calendar.Name == sourceName) || strings.TrimRight(calendar.Path, "/") == strings.TrimRight(endpoint, "/") {
			_, err := s.db.Exec(`UPDATE calendar_sources SET calendar_name = COALESCE(NULLIF(?, ''), calendar_name), color = COALESCE(NULLIF(?, ''), color) WHERE id = ?`, calendar.Name, calendar.Color, sourceID)
			return err
		}
	}
	return nil
}

func (s *CalendarService) DeleteEvent(id string) error {
	_, err := s.db.Exec(`DELETE FROM calendar_events WHERE id = ?`, id)
	return err
}

func (s *CalendarService) SyncAllSources(ctx context.Context) {
	sources, err := s.ListSources()
	if err != nil {
		log.Printf("list sources for sync: %v", err)
		return
	}

	for _, src := range sources {
		if !src.Active {
			continue
		}
		count, err := s.SyncSource(ctx, src.ID)
		if err != nil {
			log.Printf("sync source %s (%s): %v", src.Name, src.ID, err)
			continue
		}
		log.Printf("synced %d events from %s", count, src.Name)
	}
}
