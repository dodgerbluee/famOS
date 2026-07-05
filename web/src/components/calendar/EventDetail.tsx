import type { CalendarEvent } from '../../api/client';
import { formatCalendarEventDate } from '../../lib/calendar';
import { formatTime, useTimezone } from '../../lib/timezone';

interface EventDetailProps {
  event: CalendarEvent;
  onClose: () => void;
}

export function EventDetail({ event, onClose }: EventDetailProps) {
  const timezone = useTimezone();

  const startTime = event.allDay
    ? 'All Day'
    : formatTime(event.startAt, timezone);

  const endTime = event.allDay
    ? ''
    : formatTime(event.endAt, timezone);

  const dateStr = formatCalendarEventDate(event, timezone, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-text-bright">{event.title}</h3>
            <p className="text-text-dim text-sm mt-1">{dateStr}</p>
            <p className="text-text-dim text-sm">
              {startTime}{endTime ? ` - ${endTime}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-text-dim text-2xl leading-none p-2 -mr-2 -mt-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {event.location && (
          <div>
            <p className="text-text-dim text-xs uppercase tracking-wide mb-0.5">Location</p>
            <p className="text-text-bright text-sm">{event.location}</p>
          </div>
        )}

        {event.description && (
          <div>
            <p className="text-text-dim text-xs uppercase tracking-wide mb-0.5">Description</p>
            <p className="text-text-bright text-sm whitespace-pre-wrap">{event.description}</p>
          </div>
        )}

        {event.sourceName && (
          <div className="space-y-1">
            <span
              className="inline-block text-xs px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: `${event.sourceColor || '#6366f1'}22`,
                color: event.sourceColor || '#6366f1',
              }}
            >
              {event.sourceName}
            </span>
            {event.sourceCalendarName && (
              <p className="text-text-dim text-sm">Calendar: {event.sourceCalendarName}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
