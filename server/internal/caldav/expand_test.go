package caldav

import (
	"testing"
	"time"
)

func TestExpand_WeeklyTueThuPracticeAppearsInLaterWeek(t *testing.T) {
	chicago, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}

	// Series began Tuesday 1 Sep 2026, 4:00–5:30pm. Later weeks must still show.
	master := ParsedEvent{
		UID:            "practice-1",
		Summary:        "Practice",
		StartAt:        time.Date(2026, 9, 1, 16, 0, 0, 0, chicago),
		EndAt:          time.Date(2026, 9, 1, 17, 30, 0, 0, chicago),
		RecurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH",
	}

	from := time.Date(2026, 9, 28, 0, 0, 0, 0, chicago) // Monday
	to := time.Date(2026, 10, 5, 0, 0, 0, 0, chicago)   // next Monday

	got := Expand([]ParsedEvent{master}, from, to)
	if len(got) != 2 {
		t.Fatalf("expected Tue+Thu instances, got %d: %+v", len(got), starts(got))
	}
	if !got[0].StartAt.Equal(time.Date(2026, 9, 29, 16, 0, 0, 0, chicago)) {
		t.Fatalf("Tuesday practice: got %s", got[0].StartAt)
	}
	if !got[1].StartAt.Equal(time.Date(2026, 10, 1, 16, 0, 0, 0, chicago)) {
		t.Fatalf("Thursday practice: got %s", got[1].StartAt)
	}
	if !got[0].EndAt.Equal(time.Date(2026, 9, 29, 17, 30, 0, 0, chicago)) {
		t.Fatalf("Tuesday end: got %s", got[0].EndAt)
	}
}

func TestExpand_ExDateSkipsCancelledPractice(t *testing.T) {
	chicago, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	master := ParsedEvent{
		UID:            "practice-1",
		Summary:        "Practice",
		StartAt:        time.Date(2026, 9, 1, 16, 0, 0, 0, chicago),
		EndAt:          time.Date(2026, 9, 1, 17, 30, 0, 0, chicago),
		RecurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH",
		ExceptionDates: []time.Time{time.Date(2026, 10, 1, 16, 0, 0, 0, chicago)},
	}

	from := time.Date(2026, 9, 28, 0, 0, 0, 0, chicago)
	to := time.Date(2026, 10, 5, 0, 0, 0, 0, chicago)
	got := Expand([]ParsedEvent{master}, from, to)
	if len(got) != 1 {
		t.Fatalf("expected only Tuesday after EXDATE, got %d: %+v", len(got), starts(got))
	}
	if got[0].StartAt.Weekday() != time.Tuesday {
		t.Fatalf("expected Tuesday, got %s", got[0].StartAt)
	}
}

func TestExpand_RecurrenceIDOverrideAndCancelledInstance(t *testing.T) {
	chicago, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	master := ParsedEvent{
		UID:            "practice-1",
		Summary:        "Practice",
		StartAt:        time.Date(2026, 9, 1, 16, 0, 0, 0, chicago),
		EndAt:          time.Date(2026, 9, 1, 17, 30, 0, 0, chicago),
		RecurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH",
	}
	moved := ParsedEvent{
		UID:          "practice-1",
		Summary:      "Practice (moved)",
		StartAt:      time.Date(2026, 9, 29, 18, 0, 0, 0, chicago),
		EndAt:        time.Date(2026, 9, 29, 19, 0, 0, 0, chicago),
		RecurrenceID: time.Date(2026, 9, 29, 16, 0, 0, 0, chicago),
	}
	cancelled := ParsedEvent{
		UID:          "practice-1",
		Summary:      "Practice",
		StartAt:      time.Date(2026, 10, 1, 16, 0, 0, 0, chicago),
		EndAt:        time.Date(2026, 10, 1, 17, 30, 0, 0, chicago),
		RecurrenceID: time.Date(2026, 10, 1, 16, 0, 0, 0, chicago),
		Status:       "CANCELLED",
	}

	from := time.Date(2026, 9, 28, 0, 0, 0, 0, chicago)
	to := time.Date(2026, 10, 5, 0, 0, 0, 0, chicago)
	got := Expand([]ParsedEvent{master, moved, cancelled}, from, to)
	if len(got) != 1 {
		t.Fatalf("expected only moved Tuesday, got %d: %+v", len(got), summaries(got))
	}
	if got[0].Summary != "Practice (moved)" {
		t.Fatalf("expected moved override, got %q at %s", got[0].Summary, got[0].StartAt)
	}
	if !got[0].StartAt.Equal(moved.StartAt) {
		t.Fatalf("moved start: got %s", got[0].StartAt)
	}
}

func TestExpand_WeeklyByDayWhenDtStartIsNotOnThoseDays(t *testing.T) {
	chicago, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	// Created Monday; repeats Tuesday/Thursday only.
	master := ParsedEvent{
		UID:            "practice-1",
		Summary:        "Practice",
		StartAt:        time.Date(2026, 8, 31, 16, 0, 0, 0, chicago), // Monday
		EndAt:          time.Date(2026, 8, 31, 17, 30, 0, 0, chicago),
		RecurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH",
	}
	from := time.Date(2026, 9, 28, 0, 0, 0, 0, chicago)
	to := time.Date(2026, 10, 5, 0, 0, 0, 0, chicago)
	got := Expand([]ParsedEvent{master}, from, to)
	if len(got) != 2 {
		t.Fatalf("expected Tue+Thu, got %d: %+v", len(got), starts(got))
	}
	if got[0].StartAt.Weekday() != time.Tuesday || got[1].StartAt.Weekday() != time.Thursday {
		t.Fatalf("weekdays: %s %s", got[0].StartAt.Weekday(), got[1].StartAt.Weekday())
	}
}

func TestExpand_CancelledWeeklySchoolDaysMasterHidden(t *testing.T) {
	chicago, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	master := ParsedEvent{
		UID:            "school-days",
		Summary:        "Kids School",
		AllDay:         true,
		StartAt:        time.Date(2025, 8, 25, 0, 0, 0, 0, chicago),
		EndAt:          time.Date(2025, 8, 26, 0, 0, 0, 0, chicago),
		RecurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
		Status:         "CANCELLED",
	}
	from := time.Date(2026, 9, 28, 0, 0, 0, 0, chicago)
	to := time.Date(2026, 10, 5, 0, 0, 0, 0, chicago)
	got := Expand([]ParsedEvent{master}, from, to)
	if len(got) != 0 {
		t.Fatalf("cancelled school-day series must not expand, got %d: %+v", len(got), summaries(got))
	}
}

func TestExpand_GoogleCancelledCopyHidesConfirmedMaster(t *testing.T) {
	chicago, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	master := ParsedEvent{
		UID:            "school-days",
		Summary:        "Kids School",
		AllDay:         true,
		StartAt:        time.Date(2025, 8, 25, 0, 0, 0, 0, chicago),
		EndAt:          time.Date(2025, 8, 26, 0, 0, 0, 0, chicago),
		RecurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
		Status:         "CONFIRMED",
	}
	// Same UID, no RECURRENCE-ID: Google/CalDAV cancelled copy of the series.
	cancelledCopy := ParsedEvent{
		UID:     "school-days",
		Summary: "Kids School",
		AllDay:  true,
		StartAt: time.Date(2025, 8, 25, 0, 0, 0, 0, chicago),
		EndAt:   time.Date(2025, 8, 26, 0, 0, 0, 0, chicago),
		Status:  "CANCELLED",
	}
	from := time.Date(2026, 9, 28, 0, 0, 0, 0, chicago)
	to := time.Date(2026, 10, 5, 0, 0, 0, 0, chicago)
	got := Expand([]ParsedEvent{master, cancelledCopy}, from, to)
	if len(got) != 0 {
		t.Fatalf("cancelled copy must hide the series, got %d: %+v", len(got), summaries(got))
	}
}

func TestExpand_AllDayCancelledInstanceDateRecurrenceID(t *testing.T) {
	chicago, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	master := ParsedEvent{
		UID:            "school-days",
		Summary:        "Kids School",
		AllDay:         true,
		StartAt:        time.Date(2026, 8, 31, 0, 0, 0, 0, chicago), // Monday
		EndAt:          time.Date(2026, 9, 1, 0, 0, 0, 0, chicago),
		RecurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
	}
	// Google all-day RECURRENCE-ID;VALUE=DATE often parses as UTC midnight.
	cancelledTue := ParsedEvent{
		UID:          "school-days",
		Summary:      "Kids School",
		AllDay:       true,
		StartAt:      time.Date(2026, 9, 29, 0, 0, 0, 0, time.UTC),
		EndAt:        time.Date(2026, 9, 30, 0, 0, 0, 0, time.UTC),
		RecurrenceID: time.Date(2026, 9, 29, 0, 0, 0, 0, time.UTC),
		Status:       "CANCELLED",
	}
	from := time.Date(2026, 9, 28, 0, 0, 0, 0, chicago)
	to := time.Date(2026, 10, 3, 0, 0, 0, 0, chicago) // Mon-Fri window
	got := Expand([]ParsedEvent{master, cancelledTue}, from, to)
	for _, ev := range got {
		if ev.StartAt.In(chicago).Weekday() == time.Tuesday {
			t.Fatalf("cancelled Tuesday school day still present: %s", ev.StartAt)
		}
	}
	if len(got) != 4 {
		t.Fatalf("expected Mon/Wed/Thu/Fri, got %d: %+v", len(got), starts(got))
	}
}

func TestExpand_AllDayExDateDateValue(t *testing.T) {
	chicago, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	master := ParsedEvent{
		UID:            "school-days",
		Summary:        "Kids School",
		AllDay:         true,
		StartAt:        time.Date(2026, 8, 31, 0, 0, 0, 0, chicago),
		EndAt:          time.Date(2026, 9, 1, 0, 0, 0, 0, chicago),
		RecurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
		ExceptionDates: []time.Time{time.Date(2026, 9, 29, 0, 0, 0, 0, time.UTC)},
	}
	from := time.Date(2026, 9, 28, 0, 0, 0, 0, chicago)
	to := time.Date(2026, 10, 3, 0, 0, 0, 0, chicago)
	got := Expand([]ParsedEvent{master}, from, to)
	for _, ev := range got {
		if ev.StartAt.In(chicago).Weekday() == time.Tuesday {
			t.Fatalf("EXDATE Tuesday still present: %s", ev.StartAt)
		}
	}
	if len(got) != 4 {
		t.Fatalf("expected 4 school days after EXDATE, got %d: %+v", len(got), starts(got))
	}
}

func TestExpand_ThisAndFutureCancelledSchoolDays(t *testing.T) {
	chicago, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	master := ParsedEvent{
		UID:            "school-days",
		Summary:        "Kids School",
		AllDay:         true,
		StartAt:        time.Date(2026, 8, 31, 0, 0, 0, 0, chicago),
		EndAt:          time.Date(2026, 9, 1, 0, 0, 0, 0, chicago),
		RecurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
	}
	cancelledFromWed := ParsedEvent{
		UID:             "school-days",
		Summary:         "Kids School",
		AllDay:          true,
		StartAt:         time.Date(2026, 9, 30, 0, 0, 0, 0, time.UTC),
		EndAt:           time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC),
		RecurrenceID:    time.Date(2026, 9, 30, 0, 0, 0, 0, time.UTC),
		RecurrenceRange: "THISANDFUTURE",
		Status:          "CANCELLED",
	}
	from := time.Date(2026, 9, 28, 0, 0, 0, 0, chicago)
	to := time.Date(2026, 10, 3, 0, 0, 0, 0, chicago)
	got := Expand([]ParsedEvent{master, cancelledFromWed}, from, to)
	if len(got) != 2 {
		t.Fatalf("expected only Mon+Tue before THISANDFUTURE, got %d: %+v", len(got), starts(got))
	}
	if got[0].StartAt.In(chicago).Weekday() != time.Monday || got[1].StartAt.In(chicago).Weekday() != time.Tuesday {
		t.Fatalf("weekdays: %s %s", got[0].StartAt, got[1].StartAt)
	}
}

func TestExpand_CanceledAmericanSpelling(t *testing.T) {
	chicago, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	master := ParsedEvent{
		UID:            "school-days",
		Summary:        "Kids School",
		AllDay:         true,
		StartAt:        time.Date(2025, 8, 25, 0, 0, 0, 0, chicago),
		EndAt:          time.Date(2025, 8, 26, 0, 0, 0, 0, chicago),
		RecurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
		Status:         "CANCELED",
	}
	got := Expand([]ParsedEvent{master}, time.Date(2026, 9, 28, 0, 0, 0, 0, chicago), time.Date(2026, 10, 5, 0, 0, 0, 0, chicago))
	if len(got) != 0 {
		t.Fatalf("CANCELED master still expanded: %+v", summaries(got))
	}
}

func TestExpand_OriginalOccurrenceOutsideWindowIsNotReturned(t *testing.T) {
	chicago, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	master := ParsedEvent{
		UID:            "practice-1",
		Summary:        "Practice",
		StartAt:        time.Date(2026, 9, 1, 16, 0, 0, 0, chicago),
		EndAt:          time.Date(2026, 9, 1, 17, 30, 0, 0, chicago),
		RecurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH",
	}
	from := time.Date(2026, 9, 28, 0, 0, 0, 0, chicago)
	to := time.Date(2026, 10, 5, 0, 0, 0, 0, chicago)
	got := Expand([]ParsedEvent{master}, from, to)
	for _, ev := range got {
		if ev.StartAt.Equal(master.StartAt) {
			t.Fatal("returned the original 1 Sep occurrence instead of this week's instances")
		}
	}
}

func starts(events []ParsedEvent) []string {
	out := make([]string, len(events))
	for i, ev := range events {
		out[i] = ev.StartAt.Format(time.RFC3339)
	}
	return out
}

func summaries(events []ParsedEvent) []string {
	out := make([]string, len(events))
	for i, ev := range events {
		out[i] = ev.Summary + "@" + ev.StartAt.Format(time.RFC3339)
	}
	return out
}
