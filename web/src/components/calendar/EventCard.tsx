import type { CalendarEvent } from '../../api/client';
import { getEventVisualState } from '../../lib/calendar';
import { formatTime, useTimezone } from '../../lib/timezone';

interface EventCardProps {
  event: CalendarEvent;
  compact?: boolean;
  onSelect?: (event: CalendarEvent) => void;
  referenceTime?: Date;
}

export function EventCard({ event, compact, onSelect, referenceTime = new Date() }: EventCardProps) {
  const timezone = useTimezone();
  const visualState = getEventVisualState(event, referenceTime);
  const startTime = event.allDay
    ? 'All Day'
    : formatTime(event.startAt, timezone);

  const endTime = event.allDay
    ? ''
    : formatTime(event.endAt, timezone);

  return (
    <button
      onClick={() => onSelect?.(event)}
      className={`rounded-xl flex gap-3 w-full text-left ${compact ? 'p-2' : 'p-3 bg-surface-light'} ${visualState === 'muted' ? 'opacity-45' : ''} ${visualState === 'highlight' ? 'ring-1 ring-accent-yellow/50 bg-accent-yellow/10' : ''} ${onSelect ? 'active:scale-[0.98] transition-transform' : ''}`}
    >
      <div
        className="w-1 rounded-full flex-shrink-0"
        style={{ backgroundColor: event.sourceColor || '#6366f1' }}
      />
      <div className="flex-1 min-w-0">
        <p className={`font-medium truncate ${visualState === 'muted' ? 'text-text-dim' : 'text-text-bright'} ${compact ? 'text-sm' : ''}`}>
          {event.title}
        </p>
        <div className="flex items-center gap-2 text-text-dim text-xs mt-0.5">
          <span>{startTime}{endTime ? ` – ${endTime}` : ''}</span>
          {event.location && (
            <>
              <span>·</span>
              <span className="truncate">{event.location}</span>
            </>
          )}
        </div>
        {event.aiEnrichment && !compact && (
          <p className="text-accent-blue text-xs mt-1 italic">
            {tryParseEnrichment(event.aiEnrichment)}
          </p>
        )}
        {!compact && event.sourceName && (
          <span
            className="inline-block text-xs px-2 py-0.5 rounded-full mt-1"
            style={{
              backgroundColor: `${event.sourceColor || '#6366f1'}22`,
              color: event.sourceColor || '#6366f1',
            }}
          >
            {event.sourceName}
          </span>
        )}
      </div>
    </button>
  );
}

function tryParseEnrichment(raw: string): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return parsed.summary || parsed.note || raw;
  } catch {
    return raw;
  }
}
