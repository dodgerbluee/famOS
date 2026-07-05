import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import { formatDate, formatTime, useTimezone } from '../lib/timezone';

interface BatchRun {
  id: string;
  jobName: string;
  status: 'running' | 'success' | 'error';
  result: string;
  errorMessage: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number;
}

const JOB_LABELS: Record<string, string> = {
  daily_briefing: 'Daily AI Briefing',
};

const STATUS_STYLES: Record<string, string> = {
  running: 'bg-accent-yellow/20 text-accent-yellow',
  success: 'bg-accent-green/20 text-accent-green',
  error: 'bg-accent-red/20 text-accent-red',
};

export function BatchProcesses() {
  const [runs, setRuns] = useState<BatchRun[]>([]);
  const [triggering, setTriggering] = useState(false);
  const timezone = useTimezone();

  const load = useCallback(() => {
    api.get<BatchRun[]>('/api/batch/runs').then(setRuns).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useWebSocket(
    useCallback(
      (msg: { type: string }) => {
        if (msg.type === 'batch_run_complete') load();
      },
      [load]
    )
  );

  const triggerBriefing = async () => {
    setTriggering(true);
    try {
      await api.post('/api/batch/trigger/briefing', {});
      setTimeout(load, 1000);
    } catch {
      /* ignored */
    } finally {
      setTriggering(false);
    }
  };

  const nextRun = getNextScheduledRun(timezone);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-3xl font-bold text-text-bright">Batch Processes</h1>
          <p className="text-text-dim text-sm">Automated background jobs</p>
        </div>
        <button
          onClick={triggerBriefing}
          disabled={triggering}
          className="bg-primary text-white px-4 py-2 rounded-xl font-medium min-h-[44px] active:scale-95 transition-transform disabled:opacity-50"
        >
          {triggering ? 'Starting...' : 'Run Briefing Now'}
        </button>
      </header>

      {/* Scheduled jobs */}
      <div className="bg-surface rounded-2xl p-5">
        <h2 className="text-lg font-semibold text-text-bright mb-3">Scheduled Jobs</h2>
        <div className="bg-surface-light rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-text-bright font-medium">Daily AI Briefing</p>
            <p className="text-text-dim text-sm">
              Generates a family briefing with calendar, weather, and Sanders Cash data
            </p>
          </div>
          <div className="text-right">
            <p className="text-text-dim text-sm">Daily at 5:00 AM</p>
            <p className="text-text-dim text-xs">Next: {nextRun}</p>
          </div>
        </div>
      </div>

      {/* Run history */}
      <div className="bg-surface rounded-2xl p-5">
        <h2 className="text-lg font-semibold text-text-bright mb-3">Run History</h2>
        {runs.length === 0 ? (
          <p className="text-text-dim text-sm text-center py-8">
            No batch runs yet. The daily briefing will run automatically at 5:00 AM, or trigger
            one manually above.
          </p>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <RunCard key={run.id} run={run} timezone={timezone} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RunCard({ run, timezone }: { run: BatchRun; timezone: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className="w-full text-left bg-surface-light rounded-xl p-4 active:scale-[0.99] transition-transform"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[run.status] || ''}`}
          >
            {run.status}
          </span>
          <span className="text-text-bright font-medium">
            {JOB_LABELS[run.jobName] || run.jobName}
          </span>
        </div>
        <div className="text-right">
          <p className="text-text-dim text-sm">
            {formatDate(run.startedAt, timezone, {
              month: 'short',
              day: 'numeric',
            })}{' '}
            {formatTime(run.startedAt, timezone)}
          </p>
          {run.durationMs > 0 && (
            <p className="text-text-dim text-xs">{formatDuration(run.durationMs)}</p>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-surface-lighter">
          {run.status === 'error' && run.errorMessage && (
            <p className="text-accent-red text-sm mb-2">{run.errorMessage}</p>
          )}
          {run.status === 'success' && run.result && <ResultPreview result={run.result} />}
        </div>
      )}
    </button>
  );
}

function ResultPreview({ result }: { result: string }) {
  try {
    const data = JSON.parse(result);
    if (data.summary) {
      return (
        <div className="space-y-2">
          <p className="text-text-bright text-sm">{data.summary}</p>
          {data.highlights?.length > 0 && (
            <ul className="space-y-0.5">
              {data.highlights.map((h: string, i: number) => (
                <li key={i} className="text-text-dim text-xs">
                  {h}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
  } catch {
    /* not JSON */
  }
  return <p className="text-text-dim text-sm truncate">{result}</p>;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return `${minutes}m ${remainSeconds}s`;
}

function getNextScheduledRun(timezone: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  });
  const currentHour = parseInt(formatter.format(now), 10);

  const next = new Date(now);
  if (currentHour >= 5) {
    next.setDate(next.getDate() + 1);
  }

  return formatDate(next, timezone, { weekday: 'short', month: 'short', day: 'numeric' }) + ' 5:00 AM';
}
