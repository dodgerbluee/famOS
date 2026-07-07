import type { CalendarEvent } from '../../api/client';
import { getEventVisualState, isMultiDayEvent } from '../../lib/calendar';
import { colorWithAlpha, formatCalendarLabel } from '../../lib/calendarDisplay';
import { formatDate, formatTime, useTimezone } from '../../lib/timezone';

interface EventCardProps {
  event: CalendarEvent;
  compact?: boolean;
  onSelect?: (event: CalendarEvent) => void;
  referenceTime?: Date;
}

export function EventCard({ event, compact, onSelect, referenceTime = new Date() }: EventCardProps) {
  const timezone = useTimezone();
  const visualState = getEventVisualState(event, referenceTime);
  const multiDay = isMultiDayEvent(event, timezone);

  let timeLabel: string;
  if (multiDay) {
    const startLabel = formatDate(event.startAt, timezone, { month: 'short', day: 'numeric' });
    const endLabel = formatDate(event.endAt, timezone, { month: 'short', day: 'numeric' });
    timeLabel = `${startLabel} – ${endLabel}`;
  } else if (event.allDay) {
    timeLabel = 'All Day';
  } else {
    const endTime = formatTime(event.endAt, timezone);
    timeLabel = `${formatTime(event.startAt, timezone)} – ${endTime}`;
  }

  return (
    <button
      onClick={() => onSelect?.(event)}
      className={`rounded-lg flex w-full text-left ${compact ? 'gap-1.5 py-1 px-1.5' : 'gap-3 p-3 bg-surface-light rounded-xl'} ${visualState === 'muted' ? 'opacity-45' : ''} ${visualState === 'highlight' ? 'ring-1 ring-accent-yellow/50 bg-accent-yellow/10' : ''} ${onSelect ? 'active:scale-[0.98] transition-transform' : ''}`}
    >
      <div
        className={`rounded-full flex-shrink-0 ${compact ? 'w-0.5' : 'w-1'}`}
        style={{ backgroundColor: event.sourceColor || '#6366f1' }}
      />
      <div className="flex-1 min-w-0">
        <p className={`font-medium truncate ${visualState === 'muted' ? 'text-text-dim' : 'text-text-bright'} ${compact ? 'text-xs' : ''}`}>
          {event.title}
        </p>
        <p className={`text-text-dim mt-0.5 truncate ${compact ? 'text-[10px]' : 'text-xs'}`}>
          <span>{timeLabel}</span>
          {event.location && (
            <>
              <span> · </span>
              <span>{event.location}</span>
            </>
          )}
        </p>
        {event.aiEnrichment && !compact && (
          <p className="text-accent-blue text-xs mt-1 italic">
            {tryParseEnrichment(event.aiEnrichment)}
          </p>
        )}
        {!compact && event.sourceName && (
          <span
            className="inline-block text-xs px-2 py-0.5 rounded-full mt-1"
            style={{
              backgroundColor: colorWithAlpha(event.sourceColor || '#6366f1'),
              color: event.sourceColor || '#6366f1',
            }}
          >
            {formatCalendarLabel(event.sourceCalendarName || event.sourceName)}
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
