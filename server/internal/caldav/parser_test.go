package caldav

import (
	"testing"
	"time"
)

func TestParseICS_CapturesWeeklyByDayAndExDate(t *testing.T) {
	chicago, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	ics := `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//famOS//test
BEGIN:VEVENT
UID:practice-1
DTSTART;TZID=America/Chicago:20260901T160000
DTEND;TZID=America/Chicago:20260901T173000
RRULE:FREQ=WEEKLY;BYDAY=TU,TH
EXDATE;TZID=America/Chicago:20260910T160000
SUMMARY:Practice
LOCATION:Gym
END:VEVENT
END:VCALENDAR
`
	events, err := ParseICS(ics, chicago)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	ev := events[0]
	if ev.UID != "practice-1" || ev.Summary != "Practice" {
		t.Fatalf("parsed identity: %+v", ev)
	}
	if ev.RecurrenceRule != "FREQ=WEEKLY;BYDAY=TU,TH" {
		t.Fatalf("RRULE: %q", ev.RecurrenceRule)
	}
	if len(ev.ExceptionDates) != 1 || !ev.ExceptionDates[0].Equal(time.Date(2026, 9, 10, 16, 0, 0, 0, chicago)) {
		t.Fatalf("EXDATE: %+v", ev.ExceptionDates)
	}
	if EventExternalID(ev) != "practice-1" {
		t.Fatalf("master external id: %s", EventExternalID(ev))
	}
}

func TestParseICS_RecurrenceIDGetsDistinctExternalID(t *testing.T) {
	chicago, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	ics := `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:practice-1
DTSTART;TZID=America/Chicago:20260929T180000
DTEND;TZID=America/Chicago:20260929T190000
RECURRENCE-ID;TZID=America/Chicago:20260929T160000
SUMMARY:Practice (moved)
END:VEVENT
END:VCALENDAR
`
	events, err := ParseICS(ics, chicago)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	id := EventExternalID(events[0])
	if id == "practice-1" || id == "" {
		t.Fatalf("exception must not reuse master UID as external id, got %q", id)
	}
}
