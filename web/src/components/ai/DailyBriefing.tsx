import { useState } from 'react';
import { api, type DailyBriefing as BriefingType } from '../../api/client';
import { useQuery } from '../../lib/query';

interface DailyBriefingCardProps {
  compact?: boolean;
}

interface AIStatus {
  provider: string;
  available: boolean;
}

export function DailyBriefingCard({ compact }: DailyBriefingCardProps) {
  const { data: briefing, refetch } = useQuery<BriefingType>(
    '/api/ai/briefing',
    () => api.get<BriefingType>('/api/ai/briefing'),
    { staleTime: 60_000 },
  );
  const { data: status } = useQuery<AIStatus>(
    '/api/ai/status',
    () => api.get<AIStatus>('/api/ai/status'),
    { staleTime: 60_000 },
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateBriefing = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<BriefingType>('/api/ai/briefing', {});
      const { setQueryData } = await import('../../lib/query');
      setQueryData('/api/ai/briefing', data);
      refetch();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load briefing';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (compact) {
    return (
      <div>
        {briefing ? (
          <div>
            <p className="text-text-bright text-sm">{briefing.summary}</p>
            {briefing.highlights && briefing.highlights.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {briefing.highlights.slice(0, 2).map((h, i) => (
                  <li key={i} className="text-text-dim text-xs">• {h}</li>
                ))}
              </ul>
            )}
          </div>
        ) : status?.available ? (
          <div className="space-y-2">
            <button
              onClick={generateBriefing}
              disabled={loading}
              className="text-primary-light text-sm font-medium"
            >
              {loading ? 'Generating...' : 'Generate Briefing'}
            </button>
            {error && <p className="text-accent-red text-xs">{error}</p>}
          </div>
        ) : (
          <div className="space-y-2">
            {error && <p className="text-accent-red text-sm">{error}</p>}
            <p className="text-text-dim text-sm">
              {status ? `${status.provider} not available` : 'Checking AI...'}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-bright">Daily Briefing</h2>
        {status && (
          <span className={`text-xs px-2 py-1 rounded-full ${
            status.available ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red'
          }`}>
            {status.provider} {status.available ? 'online' : 'offline'}
          </span>
        )}
      </div>

      {briefing ? (
        <div className="space-y-3 animate-[fadein_180ms_ease]">
          <p className="text-text-bright">{briefing.summary}</p>

          {briefing.highlights && briefing.highlights.length > 0 && (
            <div className="bg-surface-light rounded-xl p-3">
              <p className="text-text-dim text-xs font-medium mb-1">KEY HIGHLIGHTS</p>
              <ul className="space-y-1">
                {briefing.highlights.map((h, i) => (
                  <li key={i} className="text-text-bright text-sm">• {h}</li>
                ))}
              </ul>
            </div>
          )}

          {briefing.weatherSummary && (
            <p className="text-accent-blue text-sm">🌤️ {briefing.weatherSummary}</p>
          )}
          {briefing.calendarSummary && (
            <p className="text-accent-peach text-sm">📅 {briefing.calendarSummary}</p>
          )}
          {briefing.sandersCashSummary && (
            <p className="text-accent-green text-sm">💰 {briefing.sandersCashSummary}</p>
          )}
        </div>
      ) : (
        <div className="text-center py-4">
          {error && <p className="text-accent-red text-sm mb-2">{error}</p>}
          <button
            onClick={generateBriefing}
            disabled={loading || !status?.available}
            className="bg-primary text-white px-6 py-3 rounded-xl font-medium min-h-[48px] active:scale-95 transition-transform disabled:opacity-50"
          >
            {loading ? 'Generating...' : !status?.available ? 'AI Offline' : 'Generate Daily Briefing'}
          </button>
        </div>
      )}
    </div>
  );
}
