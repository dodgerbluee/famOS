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

func TestParseICS_CancelledSchoolDaysAndMethodCancel(t *testing.T) {
	chicago, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	ics := `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:school-days
DTSTART;VALUE=DATE:20250825
DTEND;VALUE=DATE:20250826
RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR
STATUS:CANCELLED
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
BEGIN:VEVENT
UID:school-days
DTSTART;VALUE=DATE:20260930
DTEND;VALUE=DATE:20261001
RECURRENCE-ID;RANGE=THISANDFUTURE;VALUE=DATE:20260930
STATUS:CANCELLED
SUMMARY:Kids School
END:VEVENT
END:VCALENDAR
`
	events, err := ParseICS(ics, chicago)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 3 {
		t.Fatalf("expected 3 VEVENTs, got %d", len(events))
	}
	if !isCancelled(events[0].Status) || events[0].RecurrenceRule == "" {
		t.Fatalf("cancelled master: %+v", events[0])
	}
	if events[1].RecurrenceID.IsZero() || !isCancelled(events[1].Status) {
		t.Fatalf("cancelled instance: %+v", events[1])
	}
	if events[2].RecurrenceRange != "THISANDFUTURE" {
		t.Fatalf("RANGE: %q", events[2].RecurrenceRange)
	}

	methodICS := `BEGIN:VCALENDAR
VERSION:2.0
METHOD:CANCEL
BEGIN:VEVENT
UID:old-school
DTSTART;VALUE=DATE:20250825
DTEND;VALUE=DATE:20250826
RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR
SUMMARY:Kids School
END:VEVENT
END:VCALENDAR
`
	cancelled, err := ParseICS(methodICS, chicago)
	if err != nil {
		t.Fatal(err)
	}
	if len(cancelled) != 1 || !isCancelled(cancelled[0].Status) {
		t.Fatalf("METHOD:CANCEL should mark STATUS:CANCELLED, got %+v", cancelled)
	}

	got := Expand(events[:1], time.Date(2026, 9, 28, 0, 0, 0, 0, chicago), time.Date(2026, 10, 5, 0, 0, 0, 0, chicago))
	if len(got) != 0 {
		t.Fatalf("parsed cancelled master still expanded: %+v", summaries(got))
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
