import type { CalendarEvent } from '../api/client';
import { formatDate, fromDateKey, getDateKey } from './timezone';

export type EventVisualState = 'normal' | 'muted' | 'highlight';

export function getEventVisualState(event: CalendarEvent, now: Date): EventVisualState {
  const start = new Date(event.startAt).getTime();
  const end = new Date(event.endAt).getTime();
  const current = now.getTime();
  const hour = 60 * 60 * 1000;

  if (end < current - hour) {
    return 'muted';
  }

  if (start <= current + hour && end >= current - hour) {
    return 'highlight';
  }

  return 'normal';
}

export function getCalendarEventDateKey(event: CalendarEvent, timezone: string) {
	if (event.allDay) {
		return event.startAt.split('T')[0];
	}
	return getDateKey(event.startAt, timezone);
}

export function eventSpansDate(event: CalendarEvent, dateKey: string, timezone: string): boolean {
  const startKey = getCalendarEventDateKey(event, timezone);
  if (startKey === dateKey) return true;

  const endKey = event.allDay
    ? event.endAt.split('T')[0]
    : getDateKey(event.endAt, timezone);
  if (startKey === endKey) return false;

  const dayStart = fromDateKey(dateKey, timezone, 0).getTime();
  const evStart = new Date(event.startAt).getTime();
  const evEnd = new Date(event.endAt).getTime();
  return evStart < dayStart + 86400000 && evEnd > dayStart;
}

export function isMultiDayEvent(event: CalendarEvent, timezone: string): boolean {
  // All-day events that start and end on the same day should be treated as single-day events
  if (event.allDay) {
    const startKey = event.startAt.split('T')[0];
    const endKey = event.endAt.split('T')[0];
    return startKey !== endKey;
  }

  const startKey = getDateKey(event.startAt, timezone);
  const endKey = getDateKey(event.endAt, timezone);
  return startKey !== endKey;
}

export function formatCalendarEventDate(event: CalendarEvent, timezone: string, options: Intl.DateTimeFormatOptions) {
	if (!event.allDay) {
		return formatDate(event.startAt, timezone, options);
	}
	const [year, month, day] = event.startAt.split('T')[0].split('-').map(Number);
	return formatDate(new Date(Date.UTC(year, month - 1, day, 12)), timezone, options);
}
