package ai

import "testing"

func TestParseDailyBriefingValidJSON(t *testing.T) {
	text := `Here is the briefing:
{"date":"2026-11-01","summary":"A calm Sunday.","highlights":["Church at noon"],"weatherSummary":"Mild and dry.","calendarSummary":"One event.","sandersCashNote":"No recent activity."}`

	got, complete := parseDailyBriefing(text)
	if !complete {
		t.Fatal("expected complete JSON to parse normally")
	}
	if got.Summary != "A calm Sunday." {
		t.Fatalf("summary = %q", got.Summary)
	}
	if got.SandersCashSummary != "No recent activity." {
		t.Fatalf("legacy Sanders Cash note was not preserved: %q", got.SandersCashSummary)
	}
}

func TestParseDailyBriefingRecoversFieldsBeforeTruncation(t *testing.T) {
	text := `{ "date": "2026-11-01", "summary": "This afternoon is mild and quiet.", "highlights": ["No rain expected.", "Bring a light layer."], "weatherSummary": "Clear and mild.", "calendarSummary": "The calendar includes`

	got, complete := parseDailyBriefing(text)
	if complete {
		t.Fatal("expected truncated JSON to be reported as incomplete")
	}
	if got.Summary != "This afternoon is mild and quiet." {
		t.Fatalf("summary = %q", got.Summary)
	}
	if len(got.Highlights) != 2 || got.Highlights[1] != "Bring a light layer." {
		t.Fatalf("highlights = %#v", got.Highlights)
	}
	if got.WeatherSummary != "Clear and mild." {
		t.Fatalf("weather summary = %q", got.WeatherSummary)
	}
	if got.CalendarSummary != "" {
		t.Fatalf("incomplete field should be omitted, got %q", got.CalendarSummary)
	}
}

func TestNormalizeDailyBriefingRepairsOldRawJSONSummary(t *testing.T) {
	old := DailyBriefing{
		Date:    "2026-11-01",
		Summary: `{"date":"2026-11-01","summary":"Readable summary.","highlights":["Useful detail"],"calendarSummary":"unfinished`,
	}

	got := normalizeDailyBriefing(old, "2026-11-02")
	if got.Date != "2026-11-02" {
		t.Fatalf("date = %q", got.Date)
	}
	if got.Summary != "Readable summary." {
		t.Fatalf("summary = %q", got.Summary)
	}
	if len(got.Highlights) != 1 || got.Highlights[0] != "Useful detail" {
		t.Fatalf("highlights = %#v", got.Highlights)
	}
}

func TestParseDailyBriefingHandlesEscapedContent(t *testing.T) {
	text := `{"summary":"Today's note says \"bring water\".","highlights":["Use {the} side door"],"calendarSummary":"truncated`
	got, _ := parseDailyBriefing(text)
	if got.Summary != `Today's note says "bring water".` {
		t.Fatalf("summary = %q", got.Summary)
	}
	if len(got.Highlights) != 1 || got.Highlights[0] != "Use {the} side door" {
		t.Fatalf("highlights = %#v", got.Highlights)
	}
}

func TestParseDailyBriefingIgnoresBracesInsideStrings(t *testing.T) {
	text := `Here is the briefing: {"summary":"Use the {side door today.","highlights":["All set"]} Thanks.`
	got, complete := parseDailyBriefing(text)
	if !complete {
		t.Fatal("expected valid JSON containing a brace to parse")
	}
	if got.Summary != "Use the {side door today." {
		t.Fatalf("summary = %q", got.Summary)
	}
}
