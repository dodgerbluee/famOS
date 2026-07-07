import type { CalendarEvent } from '../../api/client';
import { eventSpansDate, getCalendarEventDateKey, isMultiDayEvent } from '../../lib/calendar';
import { addMonthsInTimezone, formatDate, formatTime, fromDateKey, getDateKey, getDateParts, useTimezone } from '../../lib/timezone';

interface MonthViewProps {
  date: Date;
  events: CalendarEvent[];
  onDateChange?: (date: Date) => void;
  onDaySelect?: (date: Date) => void;
  onEventSelect?: (event: CalendarEvent) => void;
}

const MAX_VISIBLE_SINGLE = 2;

interface EventSegment {
  event: CalendarEvent;
  startCol: number;
  span: number;
  lane: number;
  isStart: boolean;
  isEnd: boolean;
}

function assignLanes(segments: Omit<EventSegment, 'lane'>[]): EventSegment[] {
  const lanes: boolean[][] = [];
  return segments.map((seg) => {
    let lane = 0;
    while (true) {
      if (!lanes[lane]) lanes[lane] = new Array(7).fill(false);
      let fits = true;
      for (let c = seg.startCol; c < seg.startCol + seg.span; c++) {
        if (lanes[lane][c]) { fits = false; break; }
      }
      if (fits) break;
      lane++;
    }
    if (!lanes[lane]) lanes[lane] = new Array(7).fill(false);
    for (let c = seg.startCol; c < seg.startCol + seg.span; c++) {
      lanes[lane][c] = true;
    }
    return { ...seg, lane };
  });
}

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
  while (days.length % 7 !== 0) days.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  const multiDay = events.filter((ev) => isMultiDayEvent(ev, timezone) && !ev.allDay);
  const singleDay = events.filter((ev) => !isMultiDayEvent(ev, timezone) || ev.allDay);

  function getWeekSegments(week: (Date | null)[]): EventSegment[] {
    const weekKeys = week.map((d) => (d ? getDateKey(d, timezone) : null));
    const raw: Omit<EventSegment, 'lane'>[] = [];

    for (const ev of multiDay) {
      let startCol = -1;
      let endCol = -1;
      for (let col = 0; col < 7; col++) {
        if (weekKeys[col] && eventSpansDate(ev, weekKeys[col]!, timezone)) {
          if (startCol === -1) startCol = col;
          endCol = col;
        }
      }
      if (startCol === -1) continue;

      const evStartKey = getCalendarEventDateKey(ev, timezone);
      const evEndKey = ev.allDay ? ev.endAt.split('T')[0] : getDateKey(ev.endAt, timezone);

      raw.push({
        event: ev,
        startCol,
        span: endCol - startCol + 1,
        isStart: weekKeys[startCol] === evStartKey,
        isEnd: weekKeys[endCol] === evEndKey,
      });
    }

    raw.sort((a, b) => a.startCol - b.startCol || b.span - a.span);
    return assignLanes(raw);
  }

  const prevMonth = () => onDateChange?.(addMonthsInTimezone(date, -1, timezone));
  const nextMonth = () => onDateChange?.(addMonthsInTimezone(date, 1, timezone));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="text-text-dim px-3 py-2 min-h-[48px] min-w-[48px] flex items-center justify-center text-xl">‹</button>
        <p className="text-text-bright font-semibold text-lg">
          {formatDate(date, timezone, { month: 'long', year: 'numeric' })}
        </p>
        <button onClick={nextMonth} className="text-text-dim px-3 py-2 min-h-[48px] min-w-[48px] flex items-center justify-center text-xl">›</button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="text-center text-text-dim text-xs font-medium py-1">{d}</div>
        ))}
      </div>

      <div className="space-y-1">
        {weeks.map((week, weekIdx) => {
          const segments = getWeekSegments(week);
          const laneCount = segments.length > 0 ? Math.max(...segments.map((s) => s.lane)) + 1 : 0;

          return (
            <div key={weekIdx}>
              {laneCount > 0 && (
                <div className="grid grid-cols-7 gap-x-1 mb-0.5" style={{ gridTemplateRows: `repeat(${laneCount}, 20px)` }}>
                  {segments.map((seg) => (
                    <button
                      key={`${seg.event.id}-${weekIdx}`}
                      onClick={(e) => { e.stopPropagation(); onEventSelect?.(seg.event); }}
                      className="truncate text-[10px] sm:text-xs px-1.5 leading-[20px] text-left hover:brightness-125 transition-all"
                      style={{
                        gridColumn: `${seg.startCol + 1} / span ${seg.span}`,
                        gridRow: seg.lane + 1,
                        backgroundColor: `${seg.event.sourceColor || '#6366f1'}25`,
                        borderLeft: seg.isStart ? `2px solid ${seg.event.sourceColor || '#6366f1'}` : undefined,
                        borderRadius: `${seg.isStart ? '4px' : '0'} ${seg.isEnd ? '4px' : '0'} ${seg.isEnd ? '4px' : '0'} ${seg.isStart ? '4px' : '0'}`,
                        color: seg.event.sourceColor || '#6366f1',
                      }}
                    >
                      {seg.isStart ? seg.event.title : `↳ ${seg.event.title}`}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-7 gap-1">
                {week.map((day, colIdx) => {
                  if (!day) return <div key={`e-${weekIdx}-${colIdx}`} className="min-h-[60px] lg:min-h-[80px]" />;

                  const dayStr = getDateKey(day, timezone);
                  const daySingleEvents = singleDay.filter((ev) => eventSpansDate(ev, dayStr, timezone));
                  const isToday = dayStr === today;
                  const visible = daySingleEvents.slice(0, MAX_VISIBLE_SINGLE);
                  const overflow = daySingleEvents.length - MAX_VISIBLE_SINGLE;

                  return (
                    <div
                      key={day.toISOString()}
                      onClick={() => onDaySelect?.(day)}
                      className={`rounded-lg p-1 min-h-[60px] lg:min-h-[80px] cursor-pointer transition-colors flex flex-col ${
                        isToday
                          ? 'bg-primary/10 ring-1 ring-primary/40'
                          : daySingleEvents.length > 0
                            ? 'bg-surface-light'
                            : 'hover:bg-surface-light/50'
                      }`}
                    >
                      <span className={`text-xs font-medium px-1 ${isToday ? 'text-primary-light font-bold' : 'text-text-dim'}`}>
                        {day.getDate()}
                      </span>
                      <div className="flex-1 mt-0.5 space-y-px overflow-hidden">
                        {visible.map((ev) => (
                          <button
                            key={ev.id}
                            onClick={(e) => { e.stopPropagation(); onEventSelect?.(ev); }}
                            className="w-full flex items-center gap-1 rounded px-1 py-px text-left hover:bg-white/5 transition-colors"
                          >
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ev.sourceColor || '#6366f1' }} />
                            <span className="text-[10px] sm:text-xs text-text-bright truncate leading-tight">
                              {ev.allDay ? ev.title : `${formatTime(ev.startAt, timezone)} ${ev.title}`}
                            </span>
                          </button>
                        ))}
                        {overflow > 0 && <p className="text-[10px] text-text-dim px-1">+{overflow} more</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
