import { api, type CalendarEvent } from '../api/client';
import { getQueryData, seedQueryData, setQueryData, useQuery } from './query';
import { addDaysInTimezone, addMonthsInTimezone, startOfMonthInTimezone } from './timezone';

export const DASHBOARD_CALENDAR_KEY = '/api/calendar/events:dashboard';

export interface DashboardCalendarCache {
  start: string;
  end: string;
  events: CalendarEvent[];
}

const remembered = new Map<string, { start: number; end: number }>();

export function calendarEventsKey(start: Date, end: Date) {
  return `/api/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`;
}

export function dashboardCalendarRange(now: Date, timezone: string) {
  const monthStart = startOfMonthInTimezone(now, timezone);
  const start = addDaysInTimezone(monthStart, -7, timezone);
  const end = addDaysInTimezone(addMonthsInTimezone(start, 1, timezone), 14, timezone);
  return { start, end };
}

export function rangesOverlap(a0: Date, a1: Date, b0: Date, b1: Date) {
  return a0.getTime() < b1.getTime() && b0.getTime() < a1.getTime();
}

export function eventOverlapsRange(event: CalendarEvent, start: Date, end: Date) {
  return new Date(event.startAt).getTime() < end.getTime() && new Date(event.endAt).getTime() > start.getTime();
}

function remember(key: string, start: Date, end: Date) {
  remembered.set(key, { start: start.getTime(), end: end.getTime() });
}

function eventsFromCache(start: Date, end: Date): CalendarEvent[] {
  const collected = new Map<string, CalendarEvent>();

  const addIfOverlap = (events: CalendarEvent[] | undefined) => {
    if (!events) return;
    for (const ev of events) {
      if (eventOverlapsRange(ev, start, end)) collected.set(ev.id, ev);
    }
  };

  const dash = getQueryData<DashboardCalendarCache>(DASHBOARD_CALENDAR_KEY);
  if (dash && rangesOverlap(start, end, new Date(dash.start), new Date(dash.end))) {
    addIfOverlap(dash.events);
  }

  for (const [key, range] of remembered) {
    if (key === DASHBOARD_CALENDAR_KEY) continue;
    if (!rangesOverlap(start, end, new Date(range.start), new Date(range.end))) continue;
    addIfOverlap(getQueryData<CalendarEvent[]>(key));
  }

  return [...collected.values()];
}

export function seedOverlappingCalendarEvents(start: Date, end: Date, key: string) {
  if (getQueryData(key) !== undefined) return;
  const events = eventsFromCache(start, end);
  const dash = getQueryData<DashboardCalendarCache>(DASHBOARD_CALENDAR_KEY);
  const dashCovers = Boolean(
    dash
    && new Date(dash.start).getTime() <= start.getTime()
    && new Date(dash.end).getTime() >= end.getTime(),
  );
  if (events.length === 0 && !dashCovers) return;
  seedQueryData(key, events);
}

export function seedDashboardCalendarEvents(events: CalendarEvent[], timezone: string, now = new Date()) {
  const { start, end } = dashboardCalendarRange(now, timezone);
  setQueryData<DashboardCalendarCache>(DASHBOARD_CALENDAR_KEY, {
    start: start.toISOString(),
    end: end.toISOString(),
    events,
  });
  remember(DASHBOARD_CALENDAR_KEY, start, end);

  for (const [key, range] of remembered) {
    if (key === DASHBOARD_CALENDAR_KEY) continue;
    if (!rangesOverlap(start, end, new Date(range.start), new Date(range.end))) continue;
    const filtered = events.filter((ev) => eventOverlapsRange(ev, new Date(range.start), new Date(range.end)));
    if (filtered.length === 0) continue;
    seedQueryData(key, filtered);
  }
}

export function useCalendarEvents(start: Date, end: Date, opts?: { enabled?: boolean; staleTime?: number }) {
  const key = calendarEventsKey(start, end);
  remember(key, start, end);
  seedOverlappingCalendarEvents(start, end, key);
  return useQuery<CalendarEvent[]>(
    key,
    () => api.get<CalendarEvent[]>(key),
    { staleTime: opts?.staleTime ?? 15_000, enabled: opts?.enabled ?? true },
  );
}
