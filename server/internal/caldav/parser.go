package caldav

import (
	"strings"
	"time"

	"github.com/emersion/go-ical"
)

type ParsedEvent struct {
	UID             string
	CalendarName    string
	CalendarColor   string
	Summary         string
	Description     string
	Location        string
	StartAt         time.Time
	EndAt           time.Time
	AllDay          bool
	RecurrenceRule  string
	RecurrenceID    time.Time
	ExceptionDates  []time.Time
	RecurrenceDates []time.Time
	Status          string
	SourceID        string
}

func ParseICS(data string, loc *time.Location) ([]ParsedEvent, error) {
	dec := ical.NewDecoder(strings.NewReader(data))
	var events []ParsedEvent

	for {
		cal, err := dec.Decode()
		if err != nil {
			break
		}

		for _, component := range cal.Children {
			if component.Name != ical.CompEvent {
				continue
			}

			parsed := parsedFromICalEvent(ical.Event{Component: component}, loc)
			if parsed.UID != "" && !parsed.StartAt.IsZero() {
				events = append(events, parsed)
			}
		}
	}

	return events, nil
}

func parsedFromICalEvent(ev ical.Event, loc *time.Location) ParsedEvent {
	parsed := ParsedEvent{}

	parsed.UID, _ = ev.Props.Text(ical.PropUID)
	parsed.Summary, _ = ev.Props.Text(ical.PropSummary)
	parsed.Description, _ = ev.Props.Text(ical.PropDescription)
	parsed.Location, _ = ev.Props.Text(ical.PropLocation)
	parsed.Status, _ = ev.Props.Text(ical.PropStatus)

	dtStart, err := ev.DateTimeStart(loc)
	if err == nil {
		parsed.StartAt = dtStart
	}

	dtEnd, err := ev.DateTimeEnd(loc)
	if err == nil {
		parsed.EndAt = dtEnd
	}

	if dtStartProp := ev.Props.Get(ical.PropDateTimeStart); dtStartProp != nil {
		if v := dtStartProp.Params.Get("VALUE"); v == "DATE" || dtStartProp.ValueType() == ical.ValueDate {
			parsed.AllDay = true
			if parsed.EndAt.IsZero() && !parsed.StartAt.IsZero() {
				parsed.EndAt = parsed.StartAt.Add(24 * time.Hour)
			}
		}
	}

	if rruleProp := ev.Props.Get(ical.PropRecurrenceRule); rruleProp != nil {
		parsed.RecurrenceRule = rruleProp.Value
	}

	if recIDProp := ev.Props.Get(ical.PropRecurrenceID); recIDProp != nil {
		if t, err := recIDProp.DateTime(loc); err == nil {
			parsed.RecurrenceID = t
		}
	}

	for _, prop := range ev.Props.Values(ical.PropExceptionDates) {
		p := prop
		parsed.ExceptionDates = append(parsed.ExceptionDates, parseICSTimes(&p, loc)...)
	}
	for _, prop := range ev.Props.Values(ical.PropRecurrenceDates) {
		p := prop
		parsed.RecurrenceDates = append(parsed.RecurrenceDates, parseICSTimes(&p, loc)...)
	}

	return parsed
}

func parseICSTimes(prop *ical.Prop, loc *time.Location) []time.Time {
	if prop == nil || strings.TrimSpace(prop.Value) == "" {
		return nil
	}
	parts := strings.Split(prop.Value, ",")
	out := make([]time.Time, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		// RDATE can be a PERIOD (start/end); keep the start.
		if i := strings.IndexByte(part, '/'); i >= 0 {
			part = part[:i]
		}
		p := *prop
		p.Value = part
		t, err := p.DateTime(loc)
		if err != nil {
			continue
		}
		out = append(out, t)
	}
	return out
}

func EventExternalID(ev ParsedEvent) string {
	if !ev.RecurrenceID.IsZero() {
		return ev.UID + "/" + ev.RecurrenceID.UTC().Format("20060102T150405Z")
	}
	return ev.UID
}
