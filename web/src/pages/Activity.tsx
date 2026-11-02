import { useMemo, useState } from 'react';
import { api, type ActivityDay } from '../api/client';
import { useQuery } from '../lib/query';
import { addDaysInTimezone, formatDate, getDateKey, todayInTimezone, useTimezone } from '../lib/timezone';

type Kind = 'chore' | 'task';

function statusClass(total: number, completed: number) {
  if (total === 0) return 'bg-white/[0.045] border-white/[0.035]';
  if (completed >= total) return 'bg-emerald-500 border-emerald-300/40';
  if (completed > 0) return 'bg-amber-400 border-amber-200/40';
  return 'bg-rose-500 border-rose-300/40';
}

export function Activity() {
  const timezone = useTimezone();
  const [kind, setKind] = useState<Kind>('chore');
  const [memberId, setMemberId] = useState('all');
  const [selectedDate, setSelectedDate] = useState(() => getDateKey(new Date(), timezone));
  const { data = [], error } = useQuery<ActivityDay[]>(
    '/api/activity?days=84',
    () => api.get<ActivityDay[]>('/api/activity?days=84'),
    { staleTime: 30_000, refetchInterval: 120_000 },
  );

  const members = useMemo(() => {
    const byId = new Map<string, string>();
    data.filter((row) => row.kind === kind).forEach((row) => byId.set(row.memberId, row.memberName));
    return [...byId].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data, kind]);

  const dates = useMemo(() => {
    const today = todayInTimezone(timezone);
    return Array.from({ length: 84 }, (_, index) => getDateKey(addDaysInTimezone(today, index - 83, timezone), timezone));
  }, [timezone]);

  const totals = useMemo(() => {
    const result = new Map<string, { total: number; completed: number }>();
    for (const row of data) {
      if (row.kind !== kind || (memberId !== 'all' && row.memberId !== memberId)) continue;
      const current = result.get(row.dateKey) ?? { total: 0, completed: 0 };
      current.total += row.total;
      current.completed += row.completed;
      result.set(row.dateKey, current);
    }
    return result;
  }, [data, kind, memberId]);

  const selectedRows = data.filter((row) => row.kind === kind && row.dateKey === selectedDate && (memberId === 'all' || row.memberId === memberId));
  const selectedTotal = selectedRows.reduce((sum, row) => sum + row.total, 0);
  const selectedCompleted = selectedRows.reduce((sum, row) => sum + row.completed, 0);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-[var(--page-gutter)] pb-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">Follow-through</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Daily activity</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">A daily view of scheduled work. Chores close three hours after their due day; tasks can still be finished late.</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-control border border-border-subtle bg-panel p-1">
          {(['chore', 'task'] as Kind[]).map((value) => (
            <button key={value} onClick={() => { setKind(value); setMemberId('all'); }} className={`min-h-10 rounded-lg px-4 text-sm font-semibold capitalize transition-colors ${kind === value ? 'bg-brand text-white' : 'text-ink-muted hover:text-ink'}`}>
              {value === 'chore' ? 'Chores' : 'Tasks'}
            </button>
          ))}
        </div>
        <button onClick={() => setMemberId('all')} className={`min-h-10 rounded-full border px-3 text-sm ${memberId === 'all' ? 'border-brand/60 bg-brand/15 text-brand-soft' : 'border-border-subtle text-ink-muted'}`}>Everyone</button>
        {members.map(([id, name]) => (
          <button key={id} onClick={() => setMemberId(id)} className={`min-h-10 rounded-full border px-3 text-sm ${memberId === id ? 'border-brand/60 bg-brand/15 text-brand-soft' : 'border-border-subtle text-ink-muted'}`}>{name}</button>
        ))}
      </div>

      <section className="rounded-card border border-border-subtle bg-panel p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-ink">Last 12 weeks</h2>
          <div className="flex items-center gap-3 text-xs text-ink-muted">
            <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-sm bg-emerald-500" />All done</span>
            <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-sm bg-amber-400" />Some</span>
            <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-sm bg-rose-500" />Missing</span>
          </div>
        </div>
        {error ? <p className="py-8 text-center text-negative">Could not load activity.</p> : (
          <div className="overflow-x-auto pb-2">
            <div className="grid min-w-[620px] grid-flow-col grid-rows-7 gap-1.5" aria-label={`${kind} completion heatmap`}>
              {dates.map((dateKey) => {
                const count = totals.get(dateKey) ?? { total: 0, completed: 0 };
                const label = `${dateKey}: ${count.completed} of ${count.total} complete`;
                return <button key={dateKey} title={label} aria-label={label} onClick={() => setSelectedDate(dateKey)} className={`aspect-square min-h-6 rounded-[5px] border transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-brand ${statusClass(count.total, count.completed)} ${selectedDate === dateKey ? 'ring-2 ring-white/70' : ''}`} />;
              })}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-card border border-border-subtle bg-panel p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">Selected day</p>
            <h2 className="mt-1 text-lg font-semibold text-ink">{formatDate(`${selectedDate}T12:00:00Z`, 'UTC', { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
          </div>
          <strong className="text-xl text-ink">{selectedCompleted}/{selectedTotal}</strong>
        </div>
        {selectedRows.length === 0 ? <p className="mt-4 text-sm text-ink-muted">No {kind === 'chore' ? 'chores' : 'tasks'} were recorded for this day.</p> : (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {selectedRows.map((row) => (
              <div key={row.memberId} className="flex items-center justify-between rounded-control border border-border-subtle bg-panel-raised px-3 py-3">
                <span className="font-medium text-ink">{row.memberName}</span>
                <span className={row.completed >= row.total ? 'text-emerald-400' : row.completed > 0 ? 'text-amber-300' : 'text-rose-400'}>{row.completed} of {row.total}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
