import { EventCard } from './EventCard';
import type { CalendarEvent } from '../../api/client';
import { formatDate, getDateKey, useTimezone } from '../../lib/timezone';

interface DayViewProps {
  date: Date;
  events: CalendarEvent[];
  compact?: boolean;
  onDateChange?: (date: Date) => void;
  onEventSelect?: (event: CalendarEvent) => void;
  referenceTime?: Date;
}

export function DayView({ date, events, compact, onDateChange, onEventSelect, referenceTime }: DayViewProps) {
  const timezone = useTimezone();
  const allDayEvents = events.filter((e) => e.allDay);
  const timedEvents = events.filter((e) => !e.allDay);

  const prevDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    onDateChange?.(d);
  };

  const nextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    onDateChange?.(d);
  };

  const isToday = getDateKey(date, timezone) === getDateKey(new Date(), timezone);

  return (
    <div>
      {!compact && (
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
        <p className={`text-text-dim text-center ${compact ? 'text-sm py-2' : 'py-6'}`}>
          {isToday ? 'No events today' : 'No events'}
        </p>
      )}
    </div>
  );
}
