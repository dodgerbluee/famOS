import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { formatDate, useTimezone } from '../../lib/timezone';

interface VikunjaTask {
  id: number;
  title: string;
  description?: string;
  done: boolean;
  priority: number;
  dueDate?: string;
  createdAt?: string;
  projectName?: string;
}

interface VikunjaStatus {
  total: number;
  overdue: number;
  dueToday: number;
  highPrio: number;
  tasks: VikunjaTask[];
}

interface VikunjaWidgetProps {
  compact?: boolean;
}

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Low', color: 'text-accent-blue' },
  2: { label: 'Med', color: 'text-accent-yellow' },
  3: { label: 'High', color: 'text-accent-peach' },
  4: { label: 'Urgent', color: 'text-accent-red' },
  5: { label: 'Critical', color: 'text-accent-red' },
};

export function VikunjaWidget({ compact }: VikunjaWidgetProps) {
  const [status, setStatus] = useState<VikunjaStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const timezone = useTimezone();

  useEffect(() => {
    api.get<VikunjaStatus>('/api/vikunja/tasks')
      .then(setStatus)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  if (error) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-text-bright mb-2">Tasks</h2>
        <p className="text-text-dim text-sm">{error}</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-text-bright mb-2">Tasks</h2>
        <p className="text-text-dim text-sm">Loading...</p>
      </div>
    );
  }

  if (status.total === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-text-bright mb-2">Tasks</h2>
        <p className="text-text-dim text-sm">No open tasks</p>
      </div>
    );
  }

  const toggle = (id: number) => setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div className="flex flex-col h-full">
      {/* Header with counts */}
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-lg font-semibold text-text-bright">Tasks</h2>
        <span className="bg-surface-lighter text-text-dim text-xs font-semibold px-2 py-0.5 rounded-full">
          {status.total}
        </span>
        {status.overdue > 0 && (
          <span className="bg-accent-red/15 text-accent-red text-xs font-semibold px-2 py-0.5 rounded-full">
            {status.overdue} overdue
          </span>
        )}
        {status.dueToday > 0 && (
          <span className="bg-accent-yellow/15 text-accent-yellow text-xs font-semibold px-2 py-0.5 rounded-full">
            {status.dueToday} due today
          </span>
        )}
      </div>

      {/* Scrollable task list */}
      <div className={`overflow-y-auto pr-1 ${compact ? 'flex-1' : 'max-h-[24rem]'}`}>
        <div className="divide-y divide-surface-lighter">
          {status.tasks.map((t) => {
            const overdue = t.dueDate ? isOverdue(t.dueDate) : false;
            const expanded = expandedId === t.id;

            return (
              <div key={t.id}>
                <button
                  onClick={() => toggle(t.id)}
                  className="w-full flex items-center gap-2 py-2 text-left hover:bg-surface-light/50 transition-colors rounded px-1 -mx-1"
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${overdue ? 'bg-accent-red' : 'bg-primary-light'}`} />
                  <span className={`text-sm flex-1 truncate ${overdue ? 'text-accent-red' : 'text-text-bright'}`}>
                    {t.title}
                  </span>
                  {t.priority >= 3 && PRIORITY_LABELS[t.priority] && (
                    <span className={`text-[10px] font-medium ${PRIORITY_LABELS[t.priority].color}`}>
                      {PRIORITY_LABELS[t.priority].label}
                    </span>
                  )}
                  {t.projectName && (
                    <span className="text-text-dim text-[10px] shrink-0">{t.projectName}</span>
                  )}
                </button>

                {expanded && (
                  <div className="ml-4 mb-2 bg-surface-light rounded-lg p-3 space-y-2">
                    {t.description && (
                      <p className="text-text-dim text-xs leading-relaxed">{t.description}</p>
                    )}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {t.projectName && (
                        <DetailRow label="Project" value={t.projectName} />
                      )}
                      {t.priority > 0 && PRIORITY_LABELS[t.priority] && (
                        <DetailRow label="Priority" value={PRIORITY_LABELS[t.priority].label} color={PRIORITY_LABELS[t.priority].color} />
                      )}
                      {t.dueDate && (
                        <DetailRow
                          label="Due"
                          value={formatDate(t.dueDate, timezone, { month: 'short', day: 'numeric', year: 'numeric' })}
                          color={overdue ? 'text-accent-red' : undefined}
                        />
                      )}
                      {t.createdAt && (
                        <DetailRow label="Created" value={formatDate(t.createdAt, timezone, { month: 'short', day: 'numeric', year: 'numeric' })} />
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-text-dim text-[11px] uppercase tracking-wide">{label}</span>
      <span className={`text-xs font-medium ${color || 'text-text-bright'}`}>{value}</span>
    </div>
  );
}

function isOverdue(dueDate: string): boolean {
  return new Date(dueDate) < new Date();
}
