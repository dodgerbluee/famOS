package service

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/sandershome/server/internal/caldav"
)

type storedCalendarEvent struct {
	CalendarEvent
	UID             string
	RecurrenceID    time.Time
	ExceptionDates  []time.Time
	RecurrenceDates []time.Time
	Status          string
}

func (s *CalendarService) expandStoredEvents(rows []storedCalendarEvent, from, to time.Time) []CalendarEvent {
	parsed := make([]caldav.ParsedEvent, 0, len(rows))
	byKey := make(map[string]storedCalendarEvent, len(rows))
	byMaster := make(map[string]storedCalendarEvent, len(rows))

	for _, row := range rows {
		ev := toParsedEvent(row, s.location)
		parsed = append(parsed, ev)
		byKey[row.SourceID+"\x00"+caldav.EventExternalID(ev)] = row
		if ev.RecurrenceID.IsZero() {
			byMaster[row.SourceID+"\x00"+ev.UID] = row
		}
	}

	expanded := caldav.Expand(parsed, from, to)
	out := make([]CalendarEvent, 0, len(expanded))
	for _, inst := range expanded {
		base, ok := byKey[inst.SourceID+"\x00"+caldav.EventExternalID(inst)]
		if !ok {
			base, ok = byMaster[inst.SourceID+"\x00"+inst.UID]
			if !ok {
				continue
			}
		}
		out = append(out, calendarEventFromInstance(base.CalendarEvent, inst))
	}
	return out
}

func toParsedEvent(row storedCalendarEvent, loc *time.Location) caldav.ParsedEvent {
	start := parseStoredTime(row.StartAt, loc)
	end := parseStoredTime(row.EndAt, loc)
	uid := row.UID
	if uid == "" {
		uid = masterUID(row.ExternalID)
	}
	return caldav.ParsedEvent{
		UID:             uid,
		SourceID:        row.SourceID,
		CalendarName:    row.SourceCalendarName,
		CalendarColor:   row.SourceCalendarColor,
		Summary:         row.Title,
		Description:     row.Description,
		Location:        row.Location,
		StartAt:         start,
		EndAt:           end,
		AllDay:          row.AllDay,
		RecurrenceRule:  row.RecurrenceRule,
		RecurrenceID:    inLocation(row.RecurrenceID, loc),
		ExceptionDates:  inLocations(row.ExceptionDates, loc),
		RecurrenceDates: inLocations(row.RecurrenceDates, loc),
		Status:          row.Status,
	}
}

func calendarEventFromInstance(base CalendarEvent, inst caldav.ParsedEvent) CalendarEvent {
	out := base
	out.Title = inst.Summary
	out.Description = inst.Description
	out.Location = inst.Location
	out.StartAt = inst.StartAt.Format(time.RFC3339)
	out.EndAt = inst.EndAt.Format(time.RFC3339)
	out.AllDay = inst.AllDay
	out.RecurrenceRule = inst.RecurrenceRule
	if !inst.RecurrenceID.IsZero() {
		stamp := inst.RecurrenceID.UTC().Format("20060102T150405Z")
		if !strings.Contains(out.ID, "/") {
			out.ID = base.ID + "/" + stamp
		}
		out.ExternalID = caldav.EventExternalID(inst)
	}
	return out
}

func masterUID(externalID string) string {
	if i := strings.IndexByte(externalID, '/'); i >= 0 {
		return externalID[:i]
	}
	return externalID
}

func parseStoredTime(raw string, loc *time.Location) time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}
	}
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return inLocation(t, loc)
	}
	if loc == nil {
		loc = time.UTC
	}
	if t, err := time.ParseInLocation("2006-01-02 15:04:05", raw, loc); err == nil {
		return t
	}
	if t, err := time.ParseInLocation("2006-01-02", raw, loc); err == nil {
		return t
	}
	return time.Time{}
}

func inLocation(t time.Time, loc *time.Location) time.Time {
	if t.IsZero() || loc == nil {
		return t
	}
	return t.In(loc)
}

func inLocations(times []time.Time, loc *time.Location) []time.Time {
	if len(times) == 0 {
		return times
	}
	out := make([]time.Time, len(times))
	for i, t := range times {
		out[i] = inLocation(t, loc)
	}
	return out
}

func encodeTimes(times []time.Time) string {
	if len(times) == 0 {
		return ""
	}
	raw := make([]string, len(times))
	for i, t := range times {
		raw[i] = t.UTC().Format(time.RFC3339)
	}
	b, err := json.Marshal(raw)
	if err != nil {
		return ""
	}
	return string(b)
}

func decodeTimes(raw string, loc *time.Location) []time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var parts []string
	if err := json.Unmarshal([]byte(raw), &parts); err != nil {
		parts = []string{raw}
	}
	out := make([]time.Time, 0, len(parts))
	for _, part := range parts {
		if t := parseStoredTime(part, loc); !t.IsZero() {
			out = append(out, t)
		}
	}
	return out
}

func encodeRecurrenceID(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}
