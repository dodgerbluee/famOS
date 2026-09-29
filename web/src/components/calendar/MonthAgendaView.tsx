import { EventCard } from './EventCard';
import type { CalendarEvent } from '../../api/client';
import { eventSpansDate, getCalendarEventDateKey, getEventVisualState, isMultiDayEvent } from '../../lib/calendar';
import { useEffect, useMemo, useRef } from 'react';
import { formatDate, fromDateKey, getDateKey, getDateParts, useTimezone } from '../../lib/timezone';

interface MonthAgendaViewProps {
  date: Date;
  events: CalendarEvent[];
  onDaySelect?: (date: Date) => void;
  onEventSelect?: (event: CalendarEvent) => void;
  referenceTime?: Date;
  autoScrollRelevant?: boolean;
}

export function MonthAgendaView({ date, events, onDaySelect, onEventSelect, referenceTime, autoScrollRelevant = false }: MonthAgendaViewProps) {
  const timezone = useTimezone();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dayRefs = useRef<Array<HTMLDivElement | null>>([]);
  const { year, month } = getDateParts(date, timezone);
  const lastDay = new Date(Date.UTC(year, month, 0, 12));
  const today = getDateKey(new Date(), timezone);

  const days = useMemo(
    () => Array.from({ length: lastDay.getUTCDate() }, (_, index) => fromDateKey(`${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`, timezone)),
    [lastDay, year, month, timezone],
  );
  const dayKeys = days.map((d) => getDateKey(d, timezone));
  const firstDayKey = dayKeys[0];

  const eventsByDayMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const day of days) {
      const dayStr = getDateKey(day, timezone);
      map.set(dayStr, events.filter((ev) => {
        if (!eventSpansDate(ev, dayStr, timezone)) return false;
        if (isMultiDayEvent(ev, timezone)) {
          const evStartKey = getCalendarEventDateKey(ev, timezone);
          if (evStartKey === dayStr) return true;
          if (firstDayKey && evStartKey < firstDayKey) return dayStr === firstDayKey;
          return false;
        }
        return true;
      }));
    }
    return map;
  }, [days, events, timezone, firstDayKey]);

  const visibleDays = useMemo(
    () => days.filter((day) => (eventsByDayMap.get(getDateKey(day, timezone)) ?? []).length > 0),
    [days, eventsByDayMap, timezone],
  );

  useEffect(() => {
    if (!autoScrollRelevant || !referenceTime || !containerRef.current) return;
    const targetIndex = visibleDays.findIndex((day) => {
      const dayEvents = eventsByDayMap.get(getDateKey(day, timezone)) ?? [];
      return dayEvents.some((event) => getEventVisualState(event, referenceTime) !== 'muted');
    });
    const index = targetIndex >= 0 ? targetIndex : 0;
    const target = dayRefs.current[index];
    if (target && containerRef.current) {
      const containerTop = containerRef.current.getBoundingClientRect().top;
      const targetTop = target.getBoundingClientRect().top;
      containerRef.current.scrollTop += targetTop - containerTop;
    }
  }, [autoScrollRelevant, referenceTime, visibleDays, eventsByDayMap, timezone]);

  return (
    <div ref={containerRef} className="space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
            {visibleDays.map((day, index) => {
        const dayEvents = eventsByDayMap.get(getDateKey(day, timezone)) ?? [];
        const isToday = getDateKey(day, timezone) === today;

        return (
          <div
            ref={(el) => { dayRefs.current[index] = el; }}
            key={day.toISOString()}
            className={`rounded-lg p-2 ${isToday ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-surface-light'}`}
            onClick={() => onDaySelect?.(day)}
          >
            <p className={`text-xs font-medium mb-1 ${isToday ? 'text-primary-light' : 'text-text-dim'}`}>
              {formatDate(day, timezone, { weekday: 'short', month: 'short', day: 'numeric' })}
              {isToday && ' · Today'}
            </p>
            {dayEvents.length > 0 ? (
              <div className="space-y-1">
                {dayEvents.map((ev) => (
                  <EventCard key={ev.id} event={ev} compact onSelect={onEventSelect} referenceTime={referenceTime} />
                ))}
              </div>
            ) : (
              <p className="text-text-dim text-xs">No events</p>
            )}
          </div>
        );
      })}
      {visibleDays.length === 0 && (
        <p className="text-text-dim text-sm text-center py-6">No events this month</p>
      )}
    </div>
  );
}
