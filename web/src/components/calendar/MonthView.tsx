import type { CalendarEvent } from '../../api/client';
import { getCalendarEventDateKey } from '../../lib/calendar';
import { addMonthsInTimezone, formatDate, formatTime, fromDateKey, getDateKey, getDateParts, useTimezone } from '../../lib/timezone';

interface MonthViewProps {
  date: Date;
  events: CalendarEvent[];
  onDateChange?: (date: Date) => void;
  onDaySelect?: (date: Date) => void;
  onEventSelect?: (event: CalendarEvent) => void;
}

const MAX_VISIBLE_EVENTS = 3;

export function MonthView({ date, events, onDateChange, onDaySelect, onEventSelect }: MonthViewProps) {
  const timezone = useTimezone();
  const { year, month } = getDateParts(date, timezone);
  const monthIndex = month - 1;

  const firstDay = fromDateKey(`${year}-${String(month).padStart(2, '0')}-01`, timezone);
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0, 12));
  const startOffset = firstDay.getDay();

  const today = getDateKey(new Date(), timezone);

  const days: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) days.push(null);
  for (let d = 1; d <= lastDay.getUTCDate(); d++) {
    days.push(fromDateKey(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`, timezone));
  }

  const eventsOnDay = (day: Date) => {
    const dayStr = getDateKey(day, timezone);
    return events.filter((ev) => getCalendarEventDateKey(ev, timezone) === dayStr);
  };

  const prevMonth = () => {
    onDateChange?.(addMonthsInTimezone(date, -1, timezone));
  };

  const nextMonth = () => {
    onDateChange?.(addMonthsInTimezone(date, 1, timezone));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="text-text-dim px-3 py-2 min-h-[48px] min-w-[48px] flex items-center justify-center text-xl"
        >
          ‹
        </button>
        <p className="text-text-bright font-semibold text-lg">
          {formatDate(date, timezone, { month: 'long', year: 'numeric' })}
        </p>
        <button
          onClick={nextMonth}
          className="text-text-dim px-3 py-2 min-h-[48px] min-w-[48px] flex items-center justify-center text-xl"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="text-center text-text-dim text-xs font-medium py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          if (!day) {
            return <div key={`empty-${i}`} className="min-h-[80px] sm:min-h-[100px]" />;
          }

          const dayEvents = eventsOnDay(day);
          const isToday = getDateKey(day, timezone) === today;
          const visible = dayEvents.slice(0, MAX_VISIBLE_EVENTS);
          const overflow = dayEvents.length - MAX_VISIBLE_EVENTS;

          return (
            <div
              key={day.toISOString()}
              onClick={() => onDaySelect?.(day)}
              className={`rounded-lg p-1 min-h-[80px] sm:min-h-[100px] cursor-pointer transition-colors flex flex-col ${
                isToday
                  ? 'bg-primary/10 ring-1 ring-primary/40'
                  : dayEvents.length > 0
                    ? 'bg-surface-light'
                    : 'hover:bg-surface-light/50'
              }`}
            >
              <span className={`text-xs font-medium px-1 ${
                isToday ? 'text-primary-light font-bold' : 'text-text-dim'
              }`}>
                {day.getDate()}
              </span>

              <div className="flex-1 mt-0.5 space-y-px overflow-hidden">
                {visible.map((ev) => (
                  <button
                    key={ev.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventSelect?.(ev);
                    }}
                    className="w-full flex items-center gap-1 rounded px-1 py-px text-left hover:bg-white/5 transition-colors"
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: ev.sourceColor || '#6366f1' }}
                    />
                    <span className="text-[10px] sm:text-xs text-text-bright truncate leading-tight">
                      {ev.allDay ? ev.title : `${formatTime(ev.startAt, timezone)} ${ev.title}`}
                    </span>
                  </button>
                ))}
                {overflow > 0 && (
                  <p className="text-[10px] text-text-dim px-1">+{overflow} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
