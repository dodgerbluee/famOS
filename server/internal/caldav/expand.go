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
	day      int // YYYYMMDD civil date; used for all-day / DATE values
	at       int64
}

type seriesKey struct {
	sourceID string
	uid      string
}

type cancelledFrom struct {
	sourceID string
	uid      string
	from     time.Time
	allDay   bool
}

func instanceKeyOf(ev ParsedEvent, t time.Time) instanceKey {
	if ev.AllDay || isCivilMidnight(t) {
		y, m, d := t.Date()
		return instanceKey{sourceID: ev.SourceID, uid: ev.UID, day: y*10000 + int(m)*100 + d}
	}
	return instanceKey{sourceID: ev.SourceID, uid: ev.UID, at: t.UTC().Unix()}
}

func seriesKeyOf(ev ParsedEvent) seriesKey {
	return seriesKey{sourceID: ev.SourceID, uid: ev.UID}
}

func isCivilMidnight(t time.Time) bool {
	if t.IsZero() {
		return false
	}
	h, min, s := t.Clock()
	return h == 0 && min == 0 && s == 0 && t.Nanosecond() == 0
}

func isThisAndFuture(rangeParam string) bool {
	return strings.EqualFold(strings.TrimSpace(rangeParam), "THISANDFUTURE")
}

// Expand turns stored VEVENTs (masters with RRULE, exceptions, singles) into
// concrete instances that overlap [from, to).
func Expand(events []ParsedEvent, from, to time.Time) []ParsedEvent {
	if to.Before(from) {
		from, to = to, from
	}

	overrides := map[instanceKey]ParsedEvent{}
	cancelled := map[instanceKey]bool{}
	cancelledSeries := map[seriesKey]bool{}
	var cancelledFromList []cancelledFrom
	var masters []ParsedEvent
	var singles []ParsedEvent

	for _, ev := range events {
		if !ev.RecurrenceID.IsZero() {
			if isCancelled(ev.Status) {
				if isThisAndFuture(ev.RecurrenceRange) {
					cancelledFromList = append(cancelledFromList, cancelledFrom{
						sourceID: ev.SourceID,
						uid:      ev.UID,
						from:     ev.RecurrenceID,
						allDay:   ev.AllDay || isCivilMidnight(ev.RecurrenceID),
					})
				} else {
					cancelled[instanceKeyOf(ev, ev.RecurrenceID)] = true
				}
				continue
			}
			overrides[instanceKeyOf(ev, ev.RecurrenceID)] = ev
			continue
		}
		if isCancelled(ev.Status) {
			cancelledSeries[seriesKeyOf(ev)] = true
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
		if cancelledSeries[seriesKeyOf(ev)] {
			continue
		}
		if overlaps(ev.StartAt, eventEnd(ev), from, to) {
			out = append(out, ev)
		}
	}

	for _, ev := range masters {
		if cancelledSeries[seriesKeyOf(ev)] {
			continue
		}
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
			if !occurrenceCancelled(ev, ev.StartAt, cancelled, cancelledFromList) && overlaps(ev.StartAt, ev.StartAt.Add(duration), from, to) {
				out = append(out, ev)
			}
			continue
		}
		for _, occ := range starts {
			if occurrenceCancelled(ev, occ, cancelled, cancelledFromList) {
				continue
			}
			k := instanceKeyOf(ev, occ)
			if ov, ok := overrides[k]; ok {
				if !isCancelled(ov.Status) && overlaps(ov.StartAt, eventEnd(ov), from, to) {
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
		if cancelledSeries[seriesKeyOf(ov)] || isCancelled(ov.Status) {
			continue
		}
		if occurrenceCancelled(ov, ov.RecurrenceID, cancelled, cancelledFromList) {
			continue
		}
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

func occurrenceCancelled(ev ParsedEvent, occ time.Time, cancelled map[instanceKey]bool, fromList []cancelledFrom) bool {
	if cancelled[instanceKeyOf(ev, occ)] {
		return true
	}
	for _, c := range fromList {
		if c.sourceID != ev.SourceID || c.uid != ev.UID {
			continue
		}
		if !occ.Before(alignToMasterStart(occ, c.from, c.allDay || ev.AllDay)) {
			return true
		}
	}
	return false
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
		set.RDate(alignToMasterStart(ev.StartAt, t, ev.AllDay))
	}
	for _, t := range ev.ExceptionDates {
		set.ExDate(alignToMasterStart(ev.StartAt, t, ev.AllDay))
	}

	// Include starts that begin before the window but still overlap it.
	after := from.Add(-duration)
	if after.After(from) {
		after = from.Add(-24 * time.Hour)
	}
	return set.Between(after, to, true), nil
}

func alignToMasterStart(masterStart, t time.Time, allDay bool) time.Time {
	if t.IsZero() || masterStart.IsZero() {
		return t
	}
	loc := masterStart.Location()
	if loc == nil {
		loc = time.UTC
	}
	if allDay || isCivilMidnight(t) {
		y, m, d := t.Date()
		return time.Date(y, m, d, masterStart.Hour(), masterStart.Minute(), masterStart.Second(), masterStart.Nanosecond(), loc)
	}
	return t.In(loc)
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
	s := strings.ToUpper(strings.TrimSpace(status))
	return s == "CANCELLED" || s == "CANCELED"
}
