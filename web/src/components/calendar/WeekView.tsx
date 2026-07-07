import { EventCard } from './EventCard';
import type { CalendarEvent } from '../../api/client';
import { eventSpansDate, getCalendarEventDateKey, getEventVisualState, isMultiDayEvent } from '../../lib/calendar';
import { useEffect, useRef } from 'react';
import { addDaysInTimezone, formatDate, formatTime, getDateKey, useTimezone } from '../../lib/timezone';

interface WeekViewProps {
  startDate: Date;
  events: CalendarEvent[];
  onDateChange?: (date: Date) => void;
  onEventSelect?: (event: CalendarEvent) => void;
  referenceTime?: Date;
  showHeader?: boolean;
  autoScrollRelevant?: boolean;
  compact?: boolean;
}

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

export function WeekView({ startDate, events, onDateChange, onEventSelect, referenceTime, showHeader = true, autoScrollRelevant = false, compact = false }: WeekViewProps) {
  const timezone = useTimezone();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dayRefs = useRef<Array<HTMLDivElement | null>>([]);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    d.setHours(12, 0, 0, 0);
    return d;
  });

  const today = getDateKey(new Date(), timezone);
  const dayKeys = days.map((d) => getDateKey(d, timezone));

  const multiDayEvents = events.filter((ev) => isMultiDayEvent(ev, timezone));
  const singleDayEvents = events.filter((ev) => !isMultiDayEvent(ev, timezone));

  const segments = (() => {
    const raw: Omit<EventSegment, 'lane'>[] = [];
    for (const ev of multiDayEvents) {
      let startCol = -1;
      let endCol = -1;
      for (let col = 0; col < 7; col++) {
        if (eventSpansDate(ev, dayKeys[col], timezone)) {
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
        isStart: dayKeys[startCol] === evStartKey,
        isEnd: dayKeys[endCol] === evEndKey,
      });
    }
    raw.sort((a, b) => a.startCol - b.startCol || b.span - a.span);
    return assignLanes(raw);
  })();

  const laneCount = segments.length > 0 ? Math.max(...segments.map((s) => s.lane)) + 1 : 0;

  const singleEventsByDay = (dayKey: string) =>
    singleDayEvents.filter((ev) => eventSpansDate(ev, dayKey, timezone));

  const compactEventsByDay = (day: Date) => {
    const dayStr = getDateKey(day, timezone);
    return events.filter((ev) => {
      if (!eventSpansDate(ev, dayStr, timezone)) return false;
      if (isMultiDayEvent(ev, timezone)) {
        const evStartKey = getCalendarEventDateKey(ev, timezone);
        if (evStartKey === dayStr) return true;
        if (evStartKey < dayKeys[0]) return dayStr === dayKeys[0];
        return false;
      }
      return true;
    });
  };

  const compactVisibleDays = compact ? days.filter((day) => compactEventsByDay(day).length > 0) : [];

  useEffect(() => {
    if (!autoScrollRelevant || !scrollRef.current) return;
    if (compact && referenceTime) {
      const targetIndex = compactVisibleDays.findIndex((day) => {
        const dayEvents = compactEventsByDay(day);
        return dayEvents.some((event) => getEventVisualState(event, referenceTime) !== 'muted');
      });
      const index = targetIndex >= 0 ? targetIndex : 0;
      const target = dayRefs.current[index];
      if (target && scrollRef.current) {
        const containerTop = scrollRef.current.getBoundingClientRect().top;
        const targetTop = target.getBoundingClientRect().top;
        scrollRef.current.scrollTop += targetTop - containerTop;
      }
    } else {
      scrollRef.current.scrollTop = 0;
    }
  }, [autoScrollRelevant, startDate]);

  const prevWeek = () => onDateChange?.(addDaysInTimezone(startDate, -7, timezone));
  const nextWeek = () => onDateChange?.(addDaysInTimezone(startDate, 7, timezone));

  if (compact) {
    return (
      <div>
        {showHeader && (
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevWeek} className="text-text-dim px-3 py-2 min-h-[48px] min-w-[48px] flex items-center justify-center text-xl">‹</button>
            <p className="text-text-bright font-semibold">
              {formatDate(startDate, timezone, { month: 'short', day: 'numeric' })}
              {' - '}
              {formatDate(days[6], timezone, { month: 'short', day: 'numeric' })}
            </p>
            <button onClick={nextWeek} className="text-text-dim px-3 py-2 min-h-[48px] min-w-[48px] flex items-center justify-center text-xl">›</button>
          </div>
        )}
        <div ref={scrollRef} className="space-y-2 overflow-y-auto max-h-[22rem] pr-1">
          {compactVisibleDays.map((day, index) => {
            const dayEvents = compactEventsByDay(day);
            const isToday = getDateKey(day, timezone) === today;
            return (
              <div ref={(el) => { dayRefs.current[index] = el; }} key={day.toISOString()} className={`rounded-lg p-2 ${isToday ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-surface-light'}`}>
                <p className={`text-xs font-medium mb-1 ${isToday ? 'text-primary-light' : 'text-text-dim'}`}>
                  {formatDate(day, timezone, { weekday: 'short', month: 'short', day: 'numeric' })}
                  {isToday && ' · Today'}
                </p>
                <div className="space-y-1">
                  {dayEvents.map((ev) => (
                    <EventCard key={ev.id} event={ev} compact onSelect={onEventSelect} referenceTime={referenceTime} />
                  ))}
                </div>
              </div>
            );
          })}
          {compactVisibleDays.length === 0 && (
            <p className="text-text-dim text-sm text-center py-6">No events this week</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {showHeader && (
        <div className="flex items-center justify-between mb-3 shrink-0">
          <button onClick={prevWeek} className="w-8 h-8 flex items-center justify-center rounded-lg text-text-dim hover:text-text-bright hover:bg-surface-lighter transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <p className="text-text-bright font-semibold text-sm">
            {formatDate(startDate, timezone, { month: 'short', day: 'numeric' })} – {formatDate(days[6], timezone, { month: 'short', day: 'numeric' })}
          </p>
          <button onClick={nextWeek} className="w-8 h-8 flex items-center justify-center rounded-lg text-text-dim hover:text-text-bright hover:bg-surface-lighter transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      )}

      {/* Day column headers */}
      <div className="grid grid-cols-7 gap-px shrink-0 mb-1">
        {days.map((day, i) => {
          const isToday = dayKeys[i] === today;
          return (
            <div key={i} className="text-center py-1.5">
              <p className={`text-[10px] uppercase tracking-wider font-semibold ${isToday ? 'text-primary-light' : 'text-text-dim'}`}>
                {formatDate(day, timezone, { weekday: 'short' })}
              </p>
              <p className={`text-lg font-bold leading-tight ${isToday ? 'text-primary-light' : 'text-text-bright'}`}>
                {formatDate(day, timezone, { day: 'numeric' })}
              </p>
            </div>
          );
        })}
      </div>

      {/* Multi-day spanning events */}
      {laneCount > 0 && (
        <div className="grid grid-cols-7 gap-x-1 mb-2 shrink-0" style={{ gridTemplateRows: `repeat(${laneCount}, 24px)` }}>
          {segments.map((seg) => (
            <button
              key={seg.event.id}
              onClick={() => onEventSelect?.(seg.event)}
              className="truncate text-[11px] px-2 leading-[24px] text-left hover:brightness-125 transition-all font-medium"
              style={{
                gridColumn: `${seg.startCol + 1} / span ${seg.span}`,
                gridRow: seg.lane + 1,
                backgroundColor: `${seg.event.sourceColor || '#6366f1'}25`,
                borderLeft: seg.isStart ? `2px solid ${seg.event.sourceColor || '#6366f1'}` : undefined,
                borderRadius: `${seg.isStart ? '6px' : '0'} ${seg.isEnd ? '6px' : '0'} ${seg.isEnd ? '6px' : '0'} ${seg.isStart ? '6px' : '0'}`,
                color: seg.event.sourceColor || '#6366f1',
              }}
            >
              {seg.isStart ? seg.event.title : `↳ ${seg.event.title}`}
            </button>
          ))}
        </div>
      )}

      {/* Single-day event columns */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-7 gap-1 h-full">
          {days.map((_day, i) => {
            const dayEvents = singleEventsByDay(dayKeys[i]);
            const isToday = dayKeys[i] === today;
            return (
              <div
                key={i}
                className={`rounded-lg p-1.5 flex flex-col gap-1 ${isToday ? 'bg-primary/5 ring-1 ring-primary/20' : 'bg-surface/50'}`}
              >
                {dayEvents.map((ev) => (
                  <WeekEventItem key={ev.id} event={ev} onSelect={onEventSelect} referenceTime={referenceTime} timezone={timezone} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WeekEventItem({ event, onSelect, referenceTime, timezone }: {
  event: CalendarEvent;
  onSelect?: (event: CalendarEvent) => void;
  referenceTime?: Date;
  timezone: string;
}) {
  const visualState = getEventVisualState(event, referenceTime || new Date());
  const timeLabel = event.allDay ? 'All day' : formatTime(event.startAt, timezone);

  return (
    <button
      onClick={() => onSelect?.(event)}
      className={`w-full text-left rounded-md px-1.5 py-1 transition-transform ${onSelect ? 'active:scale-[0.97]' : ''} ${
        visualState === 'muted' ? 'opacity-40' : ''
      } ${visualState === 'highlight' ? 'ring-1 ring-accent-yellow/50' : ''}`}
      style={{ backgroundColor: (event.sourceColor || '#6366f1') + '18' }}
    >
      <div className="flex items-start gap-1">
        <div className="w-0.5 h-3 rounded-full mt-0.5 shrink-0" style={{ backgroundColor: event.sourceColor || '#6366f1' }} />
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] font-medium leading-tight truncate ${visualState === 'muted' ? 'text-text-dim' : 'text-text-bright'}`}>
            {event.title}
          </p>
          <p className="text-[9px] text-text-dim leading-tight truncate">{timeLabel}</p>
        </div>
      </div>
    </button>
  );
}
