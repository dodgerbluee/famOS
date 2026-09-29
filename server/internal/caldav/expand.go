package caldav

import (
	"sort"
	"strings"
	"time"

	"github.com/teambition/rrule-go"
)

type instanceKey struct {
	sourceID string
	uid      string
	at       int64
}

func instanceKeyOf(ev ParsedEvent, t time.Time) instanceKey {
	return instanceKey{sourceID: ev.SourceID, uid: ev.UID, at: t.UTC().Unix()}
}

// Expand turns stored VEVENTs (masters with RRULE, exceptions, singles) into
// concrete instances that overlap [from, to).
func Expand(events []ParsedEvent, from, to time.Time) []ParsedEvent {
	if to.Before(from) {
		from, to = to, from
	}

	overrides := map[instanceKey]ParsedEvent{}
	cancelled := map[instanceKey]bool{}
	var masters []ParsedEvent
	var singles []ParsedEvent

	for _, ev := range events {
		if !ev.RecurrenceID.IsZero() {
			k := instanceKeyOf(ev, ev.RecurrenceID)
			if isCancelled(ev.Status) {
				cancelled[k] = true
				continue
			}
			overrides[k] = ev
			continue
		}
		if isCancelled(ev.Status) {
			continue
		}
		if strings.TrimSpace(ev.RecurrenceRule) != "" || len(ev.RecurrenceDates) > 0 {
			masters = append(masters, ev)
			continue
		}
		singles = append(singles, ev)
	}

	out := make([]ParsedEvent, 0, len(events))
	for _, ev := range singles {
		if overlaps(ev.StartAt, eventEnd(ev), from, to) {
			out = append(out, ev)
		}
	}

	for _, ev := range masters {
		duration := eventEnd(ev).Sub(ev.StartAt)
		if duration <= 0 {
			if ev.AllDay {
				duration = 24 * time.Hour
			} else {
				duration = time.Hour
			}
		}
		starts, err := occurrenceStarts(ev, from, to, duration)
		if err != nil {
			if overlaps(ev.StartAt, ev.StartAt.Add(duration), from, to) {
				out = append(out, ev)
			}
			continue
		}
		for _, occ := range starts {
			k := instanceKeyOf(ev, occ)
			if cancelled[k] {
				continue
			}
			if ov, ok := overrides[k]; ok {
				if overlaps(ov.StartAt, eventEnd(ov), from, to) {
					out = append(out, ov)
				}
				delete(overrides, k)
				continue
			}
			inst := ev
			inst.StartAt = occ
			inst.EndAt = occ.Add(duration)
			inst.RecurrenceID = occ
			if overlaps(inst.StartAt, inst.EndAt, from, to) {
				out = append(out, inst)
			}
		}
	}

	for _, ov := range overrides {
		if overlaps(ov.StartAt, eventEnd(ov), from, to) {
			out = append(out, ov)
		}
	}

	sort.SliceStable(out, func(i, j int) bool {
		if out[i].StartAt.Equal(out[j].StartAt) {
			return out[i].Summary < out[j].Summary
		}
		return out[i].StartAt.Before(out[j].StartAt)
	})
	return out
}

func occurrenceStarts(ev ParsedEvent, from, to time.Time, duration time.Duration) ([]time.Time, error) {
	set := rrule.Set{}
	set.DTStart(ev.StartAt)
	if strings.TrimSpace(ev.RecurrenceRule) != "" {
		rule, err := rrule.StrToRRule(ev.RecurrenceRule)
		if err != nil {
			return nil, err
		}
		set.RRule(rule)
	}
	for _, t := range ev.RecurrenceDates {
		set.RDate(t)
	}
	for _, t := range ev.ExceptionDates {
		set.ExDate(t)
	}

	// Include starts that begin before the window but still overlap it.
	after := from.Add(-duration)
	if after.After(from) {
		after = from.Add(-24 * time.Hour)
	}
	return set.Between(after, to, true), nil
}

func eventEnd(ev ParsedEvent) time.Time {
	if ev.EndAt.IsZero() || !ev.EndAt.After(ev.StartAt) {
		if ev.AllDay {
			return ev.StartAt.Add(24 * time.Hour)
		}
		return ev.StartAt.Add(time.Hour)
	}
	return ev.EndAt
}

func overlaps(start, end, from, to time.Time) bool {
	if start.IsZero() {
		return false
	}
	if !end.After(start) {
		end = start.Add(time.Nanosecond)
	}
	return start.Before(to) && end.After(from)
}

func isCancelled(status string) bool {
	return strings.EqualFold(strings.TrimSpace(status), "CANCELLED")
}
