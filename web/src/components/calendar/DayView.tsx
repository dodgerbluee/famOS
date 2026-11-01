import { memo, useMemo } from 'react';
import { EventCard } from './EventCard';
import type { CalendarEvent } from '../../api/client';
import { addDaysInTimezone, formatDate, getDateKey, useTimezone } from '../../lib/timezone';

interface DayViewProps {
  date: Date;
  events: CalendarEvent[];
  compact?: boolean;
  onDateChange?: (date: Date) => void;
  onEventSelect?: (event: CalendarEvent) => void;
  referenceTime?: Date;
  showHeader?: boolean;
}

export const DayView = memo(function DayView({ date, events, compact, onDateChange, onEventSelect, referenceTime, showHeader = true }: DayViewProps) {
  const timezone = useTimezone();
  const allDayEvents = useMemo(() => events.filter((e) => e.allDay), [events]);
  const timedEvents = useMemo(() => events.filter((e) => !e.allDay), [events]);

  const prevDay = () => {
    onDateChange?.(addDaysInTimezone(date, -1, timezone));
  };

  const nextDay = () => {
    onDateChange?.(addDaysInTimezone(date, 1, timezone));
  };

  const isToday = getDateKey(date, timezone) === getDateKey(new Date(), timezone);

  return (
    <div>
      {!compact && showHeader && (
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevDay}
            className="text-text-dim px-3 py-2 min-h-[48px] min-w-[48px] flex items-center justify-center text-xl"
          >
            ‹
          </button>
          <div className="text-center">
            <p className="text-text-bright font-semibold text-lg">
              {formatDate(date, timezone, { weekday: 'long' })}
            </p>
            <p className="text-text-dim text-sm">
              {formatDate(date, timezone, {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </div>
          <button
            onClick={nextDay}
            className="text-text-dim px-3 py-2 min-h-[48px] min-w-[48px] flex items-center justify-center text-xl"
          >
            ›
          </button>
        </div>
      )}

      {compact && !isToday && (
        <p className="text-text-dim text-xs mb-2">
          {formatDate(date, timezone, { weekday: 'short', month: 'short', day: 'numeric' })}
        </p>
      )}

      {allDayEvents.length > 0 && (
        <div className="mb-3 space-y-1">
          {allDayEvents.map((ev) => (
            <EventCard key={ev.id} event={ev} compact={compact} onSelect={onEventSelect} referenceTime={referenceTime} />
          ))}
        </div>
      )}

      <div className="space-y-1">
        {timedEvents.map((ev) => (
          <EventCard key={ev.id} event={ev} compact={compact} onSelect={onEventSelect} referenceTime={referenceTime} />
        ))}
      </div>

      {events.length === 0 && (
        <div className={`text-center ${compact ? 'py-2' : 'flex min-h-[16rem] flex-col items-center justify-center py-8'}`}>
          {!compact && (
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-border-subtle bg-surface-light text-xl text-primary-light">✓</div>
          )}
          <p className="font-medium text-text-bright">{isToday ? 'A clear day ahead' : 'Nothing scheduled'}</p>
          {!compact && <p className="mt-1 text-xs text-text-dim">Enjoy the open space or add something new.</p>}
        </div>
      )}
    </div>
  );
});
