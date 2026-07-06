import { EventCard } from './EventCard';
import type { CalendarEvent } from '../../api/client';
import { getCalendarEventDateKey, getEventVisualState } from '../../lib/calendar';
import { useEffect, useRef } from 'react';
import { addDaysInTimezone, formatDate, getDateKey, useTimezone } from '../../lib/timezone';

interface WeekViewProps {
  startDate: Date;
  events: CalendarEvent[];
  onDateChange?: (date: Date) => void;
  onEventSelect?: (event: CalendarEvent) => void;
  referenceTime?: Date;
  showHeader?: boolean;
  autoScrollRelevant?: boolean;
}

export function WeekView({ startDate, events, onDateChange, onEventSelect, referenceTime, showHeader = true, autoScrollRelevant = false }: WeekViewProps) {
  const timezone = useTimezone();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dayRefs = useRef<Array<HTMLDivElement | null>>([]);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    d.setHours(12, 0, 0, 0);
    return d;
  });

  const today = getDateKey(new Date(), timezone);

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

  const prevWeek = () => {
    onDateChange?.(addDaysInTimezone(startDate, -7, timezone));
  };

  const nextWeek = () => {
    onDateChange?.(addDaysInTimezone(startDate, 7, timezone));
  };

  return (
    <div>
      {showHeader && (
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevWeek}
            className="text-text-dim px-3 py-2 min-h-[48px] min-w-[48px] flex items-center justify-center text-xl"
          >
            ‹
          </button>
          <p className="text-text-bright font-semibold">
            {formatDate(startDate, timezone, { month: 'short', day: 'numeric' })}
            {' - '}
            {formatDate(days[6], timezone, { month: 'short', day: 'numeric' })}
          </p>
          <button
            onClick={nextWeek}
            className="text-text-dim px-3 py-2 min-h-[48px] min-w-[48px] flex items-center justify-center text-xl"
          >
            ›
          </button>
        </div>
      )}

      <div ref={containerRef} className="space-y-3 overflow-y-auto max-h-[22rem] pr-1">
        {visibleDays.map((day, index) => {
          const dayEvents = eventsByDay(day);
          const isToday = getDateKey(day, timezone) === today;

          return (
            <div ref={(el) => { dayRefs.current[index] = el; }} key={day.toISOString()} className={`rounded-xl p-3 ${isToday ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-surface-light'}`}>
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
          <p className="text-text-dim text-sm text-center py-6">No events this week</p>
        )}
      </div>
    </div>
  );
}
