package service

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/sandershome/server/internal/caldav"
	"github.com/sandershome/server/internal/db"
)

func setupCalendarTest(t *testing.T) (*CalendarService, *db.DB, *time.Location) {
	t.Helper()
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	if err := database.Migrate(); err != nil {
		t.Fatal(err)
	}
	chicago, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	return NewCalendarService(database, chicago), database, chicago
}

func insertSource(t *testing.T, database *db.DB) string {
	t.Helper()
	id := uuid.New().String()
	_, err := database.Exec(`
		INSERT INTO calendar_sources (id, name, type, url, calendar_name, color, active)
		VALUES (?, 'Family', 'ics_url', 'https://example.test/family.ics', 'Family', '#89b4fa', 1)
	`, id)
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func TestGetEvents_ExpandsWeeklyTueThuPracticeIntoCurrentWeek(t *testing.T) {
	svc, database, chicago := setupCalendarTest(t)
	sourceID := insertSource(t, database)

	master := caldav.ParsedEvent{
		UID:            "practice-1",
		Summary:        "Practice",
		Location:       "Gym",
		StartAt:        time.Date(2026, 9, 1, 16, 0, 0, 0, chicago),
		EndAt:          time.Date(2026, 9, 1, 17, 30, 0, 0, chicago),
		RecurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH",
		CalendarName:   "Family",
		CalendarColor:  "#89b4fa",
	}
	if err := svc.upsertEvent(sourceID, master); err != nil {
		t.Fatal(err)
	}

	from := time.Date(2026, 9, 28, 0, 0, 0, 0, chicago)
	to := time.Date(2026, 10, 5, 0, 0, 0, 0, chicago)
	events, err := svc.GetEvents(from, to)
	if err != nil {
		t.Fatal(err)
	}

	var starts []time.Time
	for _, ev := range events {
		if ev.Title != "Practice" {
			continue
		}
		starts = append(starts, parseStoredTime(ev.StartAt, chicago))
	}
	if len(starts) != 2 {
		t.Fatalf("expected Tue+Thu practice this week, got %d events: %v", len(starts), starts)
	}
	if !starts[0].Equal(time.Date(2026, 9, 29, 16, 0, 0, 0, chicago)) {
		t.Fatalf("Tuesday instance: got %s", starts[0])
	}
	if !starts[1].Equal(time.Date(2026, 10, 1, 16, 0, 0, 0, chicago)) {
		t.Fatalf("Thursday instance: got %s", starts[1])
	}
	ids := map[string]bool{}
	for _, ev := range events {
		if ids[ev.ID] {
			t.Fatalf("duplicate instance id %s", ev.ID)
		}
		ids[ev.ID] = true
	}
}

func TestGetEvents_ExDateAndMovedInstance(t *testing.T) {
	svc, database, chicago := setupCalendarTest(t)
	sourceID := insertSource(t, database)

	if err := svc.upsertEvent(sourceID, caldav.ParsedEvent{
		UID:            "practice-1",
		Summary:        "Practice",
		StartAt:        time.Date(2026, 9, 1, 16, 0, 0, 0, chicago),
		EndAt:          time.Date(2026, 9, 1, 17, 30, 0, 0, chicago),
		RecurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH",
		ExceptionDates: []time.Time{time.Date(2026, 10, 1, 16, 0, 0, 0, chicago)},
	}); err != nil {
		t.Fatal(err)
	}
	if err := svc.upsertEvent(sourceID, caldav.ParsedEvent{
		UID:          "practice-1",
		Summary:      "Practice (early)",
		StartAt:      time.Date(2026, 9, 29, 15, 0, 0, 0, chicago),
		EndAt:        time.Date(2026, 9, 29, 16, 0, 0, 0, chicago),
		RecurrenceID: time.Date(2026, 9, 29, 16, 0, 0, 0, chicago),
	}); err != nil {
		t.Fatal(err)
	}

	events, err := svc.GetEvents(
		time.Date(2026, 9, 28, 0, 0, 0, 0, chicago),
		time.Date(2026, 10, 5, 0, 0, 0, 0, chicago),
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 {
		t.Fatalf("expected only the moved Tuesday (Thursday EXDATE), got %d: %+v", len(events), events)
	}
	if events[0].Title != "Practice (early)" {
		t.Fatalf("title: %q", events[0].Title)
	}
	got := parseStoredTime(events[0].StartAt, chicago)
	if !got.Equal(time.Date(2026, 9, 29, 15, 0, 0, 0, chicago)) {
		t.Fatalf("moved start: %s", got)
	}
}

func TestGetEvents_OneOffStillReturnedByOverlap(t *testing.T) {
	svc, database, chicago := setupCalendarTest(t)
	sourceID := insertSource(t, database)
	if err := svc.upsertEvent(sourceID, caldav.ParsedEvent{
		UID:     "dentist",
		Summary: "Dentist",
		StartAt: time.Date(2026, 9, 30, 9, 0, 0, 0, chicago),
		EndAt:   time.Date(2026, 9, 30, 10, 0, 0, 0, chicago),
	}); err != nil {
		t.Fatal(err)
	}

	events, err := svc.GetEvents(
		time.Date(2026, 9, 28, 0, 0, 0, 0, chicago),
		time.Date(2026, 10, 5, 0, 0, 0, 0, chicago),
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 || events[0].Title != "Dentist" {
		t.Fatalf("one-off: %+v", events)
	}

	none, err := svc.GetEvents(
		time.Date(2026, 10, 6, 0, 0, 0, 0, chicago),
		time.Date(2026, 10, 7, 0, 0, 0, 0, chicago),
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(none) != 0 {
		t.Fatalf("expected no events next week, got %+v", none)
	}
}

func TestGetEvents_CancelledWeeklySchoolDaysHidden(t *testing.T) {
	svc, database, chicago := setupCalendarTest(t)
	sourceID := insertSource(t, database)

	if err := svc.upsertEvent(sourceID, caldav.ParsedEvent{
		UID:            "school-days",
		Summary:        "Kids School",
		AllDay:         true,
		StartAt:        time.Date(2025, 8, 25, 0, 0, 0, 0, chicago),
		EndAt:          time.Date(2025, 8, 26, 0, 0, 0, 0, chicago),
		RecurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
		Status:         "CANCELLED",
	}); err != nil {
		t.Fatal(err)
	}

	events, err := svc.GetEvents(
		time.Date(2026, 9, 28, 0, 0, 0, 0, chicago),
		time.Date(2026, 10, 5, 0, 0, 0, 0, chicago),
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 0 {
		t.Fatalf("cancelled school days still showing: %+v", events)
	}
}

func TestGetEvents_CancelledInstanceAndThisAndFutureSchoolDays(t *testing.T) {
	svc, database, chicago := setupCalendarTest(t)
	sourceID := insertSource(t, database)

	if err := svc.upsertEvent(sourceID, caldav.ParsedEvent{
		UID:            "school-days",
		Summary:        "Kids School",
		AllDay:         true,
		StartAt:        time.Date(2026, 8, 31, 0, 0, 0, 0, chicago),
		EndAt:          time.Date(2026, 9, 1, 0, 0, 0, 0, chicago),
		RecurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
	}); err != nil {
		t.Fatal(err)
	}
	if err := svc.upsertEvent(sourceID, caldav.ParsedEvent{
		UID:          "school-days",
		Summary:      "Kids School",
		AllDay:       true,
		StartAt:      time.Date(2026, 9, 29, 0, 0, 0, 0, time.UTC),
		EndAt:        time.Date(2026, 9, 30, 0, 0, 0, 0, time.UTC),
		RecurrenceID: time.Date(2026, 9, 29, 0, 0, 0, 0, time.UTC),
		Status:       "CANCELLED",
	}); err != nil {
		t.Fatal(err)
	}

	week, err := svc.GetEvents(
		time.Date(2026, 9, 28, 0, 0, 0, 0, chicago),
		time.Date(2026, 10, 3, 0, 0, 0, 0, chicago),
	)
	if err != nil {
		t.Fatal(err)
	}
	for _, ev := range week {
		start := parseStoredTime(ev.StartAt, chicago)
		if start.Weekday() == time.Tuesday {
			t.Fatalf("cancelled Tuesday still showing: %+v", ev)
		}
	}

	if err := svc.upsertEvent(sourceID, caldav.ParsedEvent{
		UID:             "school-days",
		Summary:         "Kids School",
		AllDay:          true,
		StartAt:         time.Date(2026, 9, 30, 0, 0, 0, 0, time.UTC),
		EndAt:           time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC),
		RecurrenceID:    time.Date(2026, 9, 30, 0, 0, 0, 0, time.UTC),
		RecurrenceRange: "THISANDFUTURE",
		Status:          "CANCELLED",
	}); err != nil {
		t.Fatal(err)
	}
	rest, err := svc.GetEvents(
		time.Date(2026, 9, 28, 0, 0, 0, 0, chicago),
		time.Date(2026, 10, 3, 0, 0, 0, 0, chicago),
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(rest) != 1 {
		t.Fatalf("expected only Monday after THISANDFUTURE (Tuesday already cancelled), got %d: %+v", len(rest), rest)
	}
}

func TestPruneMissingEvents_RemovesCancelledSeriesGoneFromFeed(t *testing.T) {
	svc, database, chicago := setupCalendarTest(t)
	sourceID := insertSource(t, database)

	if err := svc.upsertEvent(sourceID, caldav.ParsedEvent{
		UID:            "old-school",
		Summary:        "Kids School",
		AllDay:         true,
		StartAt:        time.Date(2025, 8, 25, 0, 0, 0, 0, chicago),
		EndAt:          time.Date(2025, 8, 26, 0, 0, 0, 0, chicago),
		RecurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
	}); err != nil {
		t.Fatal(err)
	}
	if err := svc.upsertEvent(sourceID, caldav.ParsedEvent{
		UID:     "dentist",
		Summary: "Dentist",
		StartAt: time.Date(2026, 9, 30, 9, 0, 0, 0, chicago),
		EndAt:   time.Date(2026, 9, 30, 10, 0, 0, 0, chicago),
	}); err != nil {
		t.Fatal(err)
	}

	if err := svc.pruneMissingEvents(sourceID, []string{"dentist"}); err != nil {
		t.Fatal(err)
	}

	events, err := svc.GetEvents(
		time.Date(2026, 9, 28, 0, 0, 0, 0, chicago),
		time.Date(2026, 10, 5, 0, 0, 0, 0, chicago),
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 || events[0].Title != "Dentist" {
		t.Fatalf("stale cancelled series should be pruned, got %+v", events)
	}
}

func TestGetEvents_ICSCancelledSchoolDayInstanceRoundTrip(t *testing.T) {
	svc, database, chicago := setupCalendarTest(t)
	sourceID := insertSource(t, database)

	ics := `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:school-days
DTSTART;VALUE=DATE:20260831
DTEND;VALUE=DATE:20260901
RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR
SUMMARY:Kids School
END:VEVENT
BEGIN:VEVENT
UID:school-days
DTSTART;VALUE=DATE:20260929
DTEND;VALUE=DATE:20260930
RECURRENCE-ID;VALUE=DATE:20260929
STATUS:CANCELLED
SUMMARY:Kids School
END:VEVENT
END:VCALENDAR
`
	parsed, err := caldav.ParseICS(ics, chicago)
	if err != nil {
		t.Fatal(err)
	}
	for _, ev := range parsed {
		if err := svc.upsertEvent(sourceID, ev); err != nil {
			t.Fatal(err)
		}
	}

	events, err := svc.GetEvents(
		time.Date(2026, 9, 28, 0, 0, 0, 0, chicago),
		time.Date(2026, 10, 3, 0, 0, 0, 0, chicago),
	)
	if err != nil {
		t.Fatal(err)
	}
	for _, ev := range events {
		start := parseStoredTime(ev.StartAt, chicago)
		if start.Weekday() == time.Tuesday {
			t.Fatalf("ICS cancelled Tuesday still showing: %+v", ev)
		}
	}
	if len(events) != 4 {
		t.Fatalf("expected Mon/Wed/Thu/Fri, got %d: %+v", len(events), events)
	}
}

func TestUpsertEvent_ExceptionDoesNotOverwriteMaster(t *testing.T) {
	svc, database, chicago := setupCalendarTest(t)
	sourceID := insertSource(t, database)
	if err := svc.upsertEvent(sourceID, caldav.ParsedEvent{
		UID:            "practice-1",
		Summary:        "Practice",
		StartAt:        time.Date(2026, 9, 1, 16, 0, 0, 0, chicago),
		EndAt:          time.Date(2026, 9, 1, 17, 30, 0, 0, chicago),
		RecurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH",
	}); err != nil {
		t.Fatal(err)
	}
	if err := svc.upsertEvent(sourceID, caldav.ParsedEvent{
		UID:          "practice-1",
		Summary:      "Practice (moved)",
		StartAt:      time.Date(2026, 9, 29, 18, 0, 0, 0, chicago),
		EndAt:        time.Date(2026, 9, 29, 19, 0, 0, 0, chicago),
		RecurrenceID: time.Date(2026, 9, 29, 16, 0, 0, 0, chicago),
	}); err != nil {
		t.Fatal(err)
	}

	var count int
	if err := database.QueryRow(`SELECT COUNT(*) FROM calendar_events WHERE source_id = ?`, sourceID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("expected master + exception rows, got %d", count)
	}
}
