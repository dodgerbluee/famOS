import type { CalendarEvent } from '../../api/client';
import { eventSpansDate, getCalendarEventDateKey, isMultiDayEvent } from '../../lib/calendar';
import { addMonthsInTimezone, formatDate, formatTime, fromDateKey, getDateKey, getDateParts, useTimezone } from '../../lib/timezone';

interface MonthViewProps {
  date: Date;
  events: CalendarEvent[];
  onDateChange?: (date: Date) => void;
  onDaySelect?: (date: Date) => void;
  onEventSelect?: (event: CalendarEvent) => void;
  showHeader?: boolean;
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

export function MonthView({ date, events, onDateChange, onDaySelect, onEventSelect, showHeader = true }: MonthViewProps) {
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
    <div className="flex flex-col h-full min-h-0">
      {showHeader && <div className="flex items-center justify-between mb-4 shrink-0">
        <button onClick={prevMonth} aria-label="Previous month" className="text-text-dim px-3 py-2 min-h-[48px] min-w-[48px] flex items-center justify-center text-xl">‹</button>
        <p className="text-text-bright font-semibold text-lg truncate px-2">
          {formatDate(date, timezone, { month: 'long', year: 'numeric' })}
        </p>
        <button onClick={nextMonth} aria-label="Next month" className="text-text-dim px-3 py-2 min-h-[48px] min-w-[48px] flex items-center justify-center text-xl">›</button>
      </div>}

      {/* One scroll region for the grid: it scrolls vertically, and horizontally once
          the canvas is narrower than the 700px minimum so day labels stay readable. */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="flex h-full min-w-[700px] flex-col">
          <div className="sticky top-0 z-10 mb-1 grid shrink-0 grid-cols-7 gap-1 rounded-xl border border-border-subtle bg-panel/90 px-1 py-1.5 backdrop-blur">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-1 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-text-dim">{d}</div>
            ))}
          </div>

          <div className="grid min-h-[420px] flex-1 gap-1 pb-1" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(76px, 1fr))` }}>
            {weeks.map((week, weekIdx) => {
            const segments = getWeekSegments(week);
            const laneCount = segments.length > 0 ? Math.max(...segments.map((s) => s.lane)) + 1 : 0;

            return (
              <div key={weekIdx} className="flex min-h-0 flex-col">
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

                <div className="grid min-h-0 flex-1 grid-cols-7 gap-1">
                  {week.map((day, colIdx) => {
                    if (!day) return <div key={`e-${weekIdx}-${colIdx}`} className="rounded-xl border border-border-subtle/40 bg-surface/20" />;

                    const dayStr = getDateKey(day, timezone);
                    const daySingleEvents = singleDay.filter((ev) => eventSpansDate(ev, dayStr, timezone));
                    const isToday = dayStr === today;
                    const visible = daySingleEvents.slice(0, MAX_VISIBLE_SINGLE);
                    const overflow = daySingleEvents.length - MAX_VISIBLE_SINGLE;

                    return (
                      <div
                        key={day.toISOString()}
                        onClick={() => onDaySelect?.(day)}
                        className={`group flex min-h-0 flex-col rounded-xl border p-1.5 text-left transition-all ${
                          isToday
                            ? 'border-primary/50 bg-gradient-to-br from-primary/20 to-primary/5 shadow-inner shadow-primary/10'
                            : daySingleEvents.length > 0
                              ? 'border-border-subtle bg-surface-light/80 hover:border-border'
                              : 'border-border-subtle/70 bg-surface/35 hover:border-border hover:bg-surface-light/60'
                        }`}
                      >
                        <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${isToday ? 'bg-primary text-white shadow-md shadow-primary/30' : 'text-text-dim group-hover:text-text-bright'}`}>
                          {day.getDate()}
                        </span>
                        <div className="flex-1 mt-0.5 space-y-px overflow-hidden">
                          {visible.map((ev) => (
                            <button
                              key={ev.id}
                              onClick={(e) => { e.stopPropagation(); onEventSelect?.(ev); }}
                              className="flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-white/5"
                            >
                              <div className="h-1.5 w-1.5 flex-shrink-0 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: ev.sourceColor || '#6366f1', color: ev.sourceColor || '#6366f1' }} />
                              <span className="text-[10px] sm:text-xs text-text-bright truncate leading-tight">
                                {ev.allDay ? ev.title : `${formatTime(ev.startAt, timezone)} ${ev.title}`}
                              </span>
                            </button>
                          ))}
                          {overflow > 0 && <p className="px-1 text-[10px] font-semibold text-primary-light">+{overflow} more</p>}
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
      </div>
    </div>
  );
}
