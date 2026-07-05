import { useEffect, useState } from 'react';
import { api, type CameraEvent } from '../../api/client';

interface EventTimelineProps {
  limit?: number;
}

export function EventTimeline({ limit = 20 }: EventTimelineProps) {
  const [events, setEvents] = useState<CameraEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<CameraEvent[]>(`/api/cameras/events?limit=${limit}`)
      .then(setEvents)
      .catch((e) => setError(e.message));
  }, [limit]);

  if (error) {
    return <p className="text-text-dim text-sm">{error}</p>;
  }

  if (events.length === 0) {
    return <p className="text-text-dim text-sm">No recent events</p>;
  }

  return (
    <div className="space-y-2">
      {events.map((ev) => {
        const time = new Date(ev.start_time * 1000);
        const ago = formatTimeAgo(time);

        return (
          <div
            key={ev.id}
            className="flex items-center gap-3 bg-surface-light rounded-xl p-3"
          >
            {ev.thumbnailUrl && (
              <img
                src={ev.thumbnailUrl}
                alt={ev.label}
                className="w-16 h-12 object-cover rounded-lg flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-text-bright text-sm font-medium capitalize">
                {ev.label}
              </p>
              <p className="text-text-dim text-xs capitalize">
                {ev.camera.replace(/_/g, ' ')}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-text-dim text-xs">{ago}</p>
              <p className="text-accent-green text-xs">
                {Math.round(ev.top_score * 100)}%
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
