import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface SeerrPendingItem {
  title: string;
  mediaType: string;
  requestedBy: string;
}

interface SeerrStatus {
  pending: number;
  approved: number;
  pendingItems: SeerrPendingItem[];
}

interface SeerrWidgetProps {
  compact?: boolean;
}

export function SeerrWidget({ compact }: SeerrWidgetProps) {
  const [status, setStatus] = useState<SeerrStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<SeerrStatus>('/api/seerr/requests')
      .then(setStatus)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  if (error) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-text-bright mb-2">Media Requests</h2>
        <p className="text-text-dim text-sm">{error}</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-text-bright mb-2">Media Requests</h2>
        <p className="text-text-dim text-sm">Loading...</p>
      </div>
    );
  }

  const pills = (size: 'xs' | 'sm') => (
    <div className={`flex ${size === 'xs' ? 'flex-col items-start gap-1.5' : 'items-center gap-3'}`}>
      <span className={`text-${size} font-semibold px-2.5 py-1 rounded-full ${status.pending > 0 ? 'bg-accent-pink/20 text-accent-pink' : 'bg-surface-lighter text-text-dim'}`}>
        {status.pending} Pending
      </span>
      <span className={`bg-surface-lighter text-text-dim text-${size} font-semibold px-2.5 py-1 rounded-full`}>
        {status.approved} Approved
      </span>
    </div>
  );

  const pendingList = status.pendingItems && status.pendingItems.length > 0 && (
    <div className="mt-2 space-y-1.5">
      {status.pendingItems.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs">{item.mediaType === 'movie' ? '🎬' : '📺'}</span>
          <span className="text-text-bright text-sm truncate flex-1">{item.title}</span>
          <span className="text-text-dim text-xs shrink-0">{item.requestedBy}</span>
        </div>
      ))}
    </div>
  );

  if (compact) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-semibold text-text-bright">Media Requests</h2>
          {status.pending > 0 && (
            <span className="w-2 h-2 rounded-full bg-accent-pink animate-pulse" />
          )}
        </div>
        {pills('xs')}
        {pendingList}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-text-bright">Media Requests</h2>
      {pills('sm')}
      {pendingList}
    </div>
  );
}
