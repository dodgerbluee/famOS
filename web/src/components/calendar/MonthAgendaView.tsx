import { EventCard } from './EventCard';
import type { CalendarEvent } from '../../api/client';
import { getCalendarEventDateKey } from '../../lib/calendar';
import { formatDate, getDateKey, useTimezone } from '../../lib/timezone';

interface MonthAgendaViewProps {
  date: Date;
  events: CalendarEvent[];
  onDaySelect?: (date: Date) => void;
  onEventSelect?: (event: CalendarEvent) => void;
  referenceTime?: Date;
}

export function MonthAgendaView({ date, events, onDaySelect, onEventSelect, referenceTime }: MonthAgendaViewProps) {
  const timezone = useTimezone();
  const year = date.getFullYear();
  const month = date.getMonth();
  const lastDay = new Date(year, month + 1, 0, 12);
  const today = getDateKey(new Date(), timezone);

  const days = Array.from({ length: lastDay.getDate() }, (_, index) => new Date(year, month, index + 1, 12));

  const eventsByDay = (day: Date) => {
    const dayStr = getDateKey(day, timezone);
    return events.filter((ev) => getCalendarEventDateKey(ev, timezone) === dayStr);
  };

  const visibleDays = days.filter((day) => eventsByDay(day).length > 0);

  return (
    <div className="space-y-3">
      {visibleDays.map((day) => {
        const dayEvents = eventsByDay(day);
        const isToday = getDateKey(day, timezone) === today;

        return (
          <div
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
