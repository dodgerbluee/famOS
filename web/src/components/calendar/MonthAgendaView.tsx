import { EventCard } from './EventCard';
import type { CalendarEvent } from '../../api/client';
import { getCalendarEventDateKey, getEventVisualState } from '../../lib/calendar';
import { useEffect, useRef } from 'react';
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

  const days = Array.from({ length: lastDay.getUTCDate() }, (_, index) => fromDateKey(`${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`, timezone));

  const eventsByDay = (day: Date) => {
    const dayStr = getDateKey(day, timezone);
    return events.filter((ev) => getCalendarEventDateKey(ev, timezone) === dayStr);
  };

  const visibleDays = days.filter((day) => eventsByDay(day).length > 0);

  useEffect(() => {
    if (!autoScrollRelevant || !referenceTime || !containerRef.current) return;
    const targetIndex = visibleDays.findIndex((day) => {
      const dayEvents = eventsByDay(day);
      return dayEvents.some((event) => getEventVisualState(event, referenceTime) !== 'muted');
    });
    const index = targetIndex >= 0 ? targetIndex : 0;
    const target = dayRefs.current[index];
    if (target) {
      containerRef.current.scrollTop = Math.max(0, target.offsetTop - 8);
    }
  }, [autoScrollRelevant, referenceTime, visibleDays]);

  return (
    <div ref={containerRef} className="space-y-3 overflow-y-auto max-h-[22rem] pr-1">
      {visibleDays.map((day, index) => {
        const dayEvents = eventsByDay(day);
        const isToday = getDateKey(day, timezone) === today;

        return (
          <div
            ref={(el) => { dayRefs.current[index] = el; }}
            key={day.toISOString()}
            className={`rounded-xl p-3 ${isToday ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-surface-light'}`}
            onClick={() => onDaySelect?.(day)}
          >
            <p className={`text-sm font-medium mb-2 ${isToday ? 'text-primary-light' : 'text-text-dim'}`}>
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
