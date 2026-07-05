import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface GatusServiceSummary {
  name: string;
  group: string;
  status: 'healthy' | 'unstable' | 'failing';
}

interface GatusStatus {
  total: number;
  healthy: number;
  unstable: number;
  failing: number;
  services: GatusServiceSummary[];
}

interface GatusWidgetProps {
  compact?: boolean;
}

const STATUS_COLOR = {
  healthy: 'text-accent-green',
  unstable: 'text-accent-peach',
  failing: 'text-accent-red',
} as const;

const DOT_COLOR = {
  healthy: 'bg-accent-green',
  unstable: 'bg-accent-peach',
  failing: 'bg-accent-red',
} as const;

export function GatusWidget({ compact }: GatusWidgetProps) {
  const [status, setStatus] = useState<GatusStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    api.get<GatusStatus>('/api/gatus/status')
      .then(setStatus)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  if (error) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-text-bright mb-2">Services</h2>
        <p className="text-text-dim text-sm">{error}</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-text-bright mb-2">Services</h2>
        <p className="text-text-dim text-sm">Loading...</p>
      </div>
    );
  }

  const allHealthy = status.unstable === 0 && status.failing === 0;

  if (compact) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-text-bright mb-3">Services</h2>
        <div className="flex flex-col items-start gap-1.5">
          <StatusPill count={status.healthy} total={status.total} kind="healthy" />
          <StatusPill count={status.unstable} total={status.total} kind="unstable" />
          <StatusPill count={status.failing} total={status.total} kind="failing" />
        </div>
        {!allHealthy && (
          <div className="mt-2 space-y-1">
            {status.services.filter((s) => s.status === 'failing').map((svc) => (
              <p key={svc.name} className="text-accent-red text-xs pl-1">
                {svc.name}
              </p>
            ))}
            {status.services.filter((s) => s.status === 'unstable').map((svc) => (
              <p key={svc.name} className="text-accent-peach text-xs pl-1">
                {svc.name}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-text-bright">Services</h2>

      <div className="flex items-center gap-3">
        <StatusPill count={status.healthy} total={status.total} kind="healthy" />
        <StatusPill count={status.unstable} total={status.total} kind="unstable" />
        <StatusPill count={status.failing} total={status.total} kind="failing" />
      </div>

      {status.failing > 0 && (
        <div className="bg-accent-red/10 rounded-xl p-3 space-y-1">
          <p className="text-accent-red text-sm font-medium">
            {status.failing} service{status.failing > 1 ? 's' : ''} down
          </p>
          {status.services.filter((s) => s.status === 'failing').map((svc) => (
            <div key={svc.name} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-red" />
              <span className="text-text-bright text-sm">{svc.name}</span>
              <span className="text-text-dim text-xs">{svc.group}</span>
            </div>
          ))}
        </div>
      )}

      {status.unstable > 0 && (
        <div className="bg-accent-peach/10 rounded-xl p-3 space-y-1">
          <p className="text-accent-peach text-sm font-medium">
            {status.unstable} service{status.unstable > 1 ? 's' : ''} unstable
          </p>
          {status.services.filter((s) => s.status === 'unstable').map((svc) => (
            <div key={svc.name} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-peach" />
              <span className="text-text-bright text-sm">{svc.name}</span>
              <span className="text-text-dim text-xs">{svc.group}</span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setExpanded(!expanded)}
        className="text-primary-light text-sm font-medium"
      >
        {expanded ? 'Hide all' : `Show all ${status.total} services`}
      </button>

      {expanded && (
        <div className="space-y-1">
          {status.services.map((svc) => (
            <div key={svc.name} className="flex items-center gap-2 py-1">
              <div className={`w-2 h-2 rounded-full ${DOT_COLOR[svc.status]}`} />
              <span className="text-text-bright text-sm flex-1">{svc.name}</span>
              <span className="text-text-dim text-xs">{svc.group}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPill({ count, total, kind }: { count: number; total: number; kind: 'healthy' | 'unstable' | 'failing' }) {
  const label = kind.charAt(0).toUpperCase() + kind.slice(1);
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${DOT_COLOR[kind]} ${kind === 'failing' && count > 0 ? 'animate-pulse' : ''}`} />
      <span className={`text-sm font-medium ${count > 0 ? STATUS_COLOR[kind] : 'text-text-dim'}`}>
        {count}/{total}
      </span>
      <span className="text-text-dim text-xs">{label}</span>
    </div>
  );
}
