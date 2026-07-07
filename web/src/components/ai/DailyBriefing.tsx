import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api, type DailyBriefing as BriefingType } from '../../api/client';

interface DailyBriefingCardProps {
  compact?: boolean;
}

interface AIStatus {
  provider: string;
  available: boolean;
}

export function DailyBriefingCard({ compact }: DailyBriefingCardProps) {
  const [briefing, setBriefing] = useState<BriefingType | null>(null);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<AIStatus>('/api/ai/status').then(setStatus).catch(() => {});
    api.get<BriefingType>('/api/ai/briefing')
      .then(setBriefing)
      .catch(() => {});
  }, []);

  const generateBriefing = async () => {
    await fetchBriefing(true);
  };

  const fetchBriefing = async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const data = refresh
        ? await api.post<BriefingType>('/api/ai/briefing', {})
        : await api.get<BriefingType>('/api/ai/briefing');
      setBriefing(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load briefing';
      if (refresh && message === 'Method Not Allowed') {
        setError('AI briefing generation needs a backend restart to enable the new endpoint.');
      } else {
        setError(message);
      }
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
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
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
        </motion.div>
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
