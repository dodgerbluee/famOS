package caldav

import (
	"strings"
	"time"

	"github.com/emersion/go-ical"
)

type ParsedEvent struct {
	UID            string
	CalendarName   string
	CalendarColor  string
	Summary        string
	Description    string
	Location       string
	StartAt        time.Time
	EndAt          time.Time
	AllDay         bool
	RecurrenceRule string
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

			event := ical.Event{Component: component}
			parsed := ParsedEvent{}

			parsed.UID, _ = event.Props.Text(ical.PropUID)
			parsed.Summary, _ = event.Props.Text(ical.PropSummary)
			parsed.Description, _ = event.Props.Text(ical.PropDescription)
			parsed.Location, _ = event.Props.Text(ical.PropLocation)

			dtStart, err := event.DateTimeStart(loc)
			if err == nil {
				parsed.StartAt = dtStart
			}

			dtEnd, err := event.DateTimeEnd(loc)
			if err == nil {
				parsed.EndAt = dtEnd
			}

			if dtStartProp := event.Props.Get(ical.PropDateTimeStart); dtStartProp != nil {
				if v := dtStartProp.Params.Get("VALUE"); v == "DATE" {
					parsed.AllDay = true
					if parsed.EndAt.IsZero() {
						parsed.EndAt = parsed.StartAt.Add(24 * time.Hour)
					}
				}
			}

			if rruleProp := event.Props.Get(ical.PropRecurrenceRule); rruleProp != nil {
				parsed.RecurrenceRule = rruleProp.Value
			}

			if parsed.UID != "" && !parsed.StartAt.IsZero() {
				events = append(events, parsed)
			}
		}
	}

	return events, nil
}
