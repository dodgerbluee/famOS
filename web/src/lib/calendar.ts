import type { CalendarEvent } from '../api/client';
import { formatDate, getDateKey } from './timezone';

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

export function formatCalendarEventDate(event: CalendarEvent, timezone: string, options: Intl.DateTimeFormatOptions) {
	if (!event.allDay) {
		return formatDate(event.startAt, timezone, options);
	}
	const [year, month, day] = event.startAt.split('T')[0].split('-').map(Number);
	return formatDate(new Date(Date.UTC(year, month - 1, day, 12)), timezone, options);
}
