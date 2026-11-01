import { useMemo, useState } from 'react';
import { api, type CalendarEvent, type CalendarSource } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import { DayView } from '../components/calendar/DayView';
import { WeekView } from '../components/calendar/WeekView';
import { MonthView } from '../components/calendar/MonthView';
import { AddEventForm } from '../components/calendar/AddEventForm';
import { EventDetail } from '../components/calendar/EventDetail';
import { useCalendarEvents } from '../lib/calendarQuery';
import { invalidateQueriesWithPrefix, useQuery } from '../lib/query';
import { useContainerWidth } from '../hooks/useContainerWidth';
import { endOfDayInTimezone, endOfMonthInTimezone, endOfWeekInTimezone, formatDate, startOfDayInTimezone, startOfMonthInTimezone, startOfWeekInTimezone, todayInTimezone, useTimezone } from '../lib/timezone';

type ViewMode = 'day' | 'week' | 'month';

const EMPTY_EVENTS: CalendarEvent[] = [];

interface SyncResult {
  sourceName: string;
  eventCount: number;
  error?: string;
}

function viewRange(currentDate: Date, viewMode: ViewMode, timezone: string) {
  if (viewMode === 'day') {
    return {
      start: startOfDayInTimezone(currentDate, timezone),
      end: endOfDayInTimezone(currentDate, timezone),
    };
  }
  if (viewMode === 'week') {
    return {
      start: startOfWeekInTimezone(currentDate, timezone),
      end: endOfWeekInTimezone(currentDate, timezone),
    };
  }
  return {
    start: startOfMonthInTimezone(currentDate, timezone),
    end: endOfMonthInTimezone(currentDate, timezone),
  };
}

export function Calendar() {
  const [manualView, setManualView] = useState<ViewMode | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ results: SyncResult[]; show: boolean } | null>(null);
  const [adding, setAdding] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const timezone = useTimezone();
  const { ref: containerRef, width: containerWidth } = useContainerWidth<HTMLDivElement>();
  const automaticView: ViewMode = containerWidth === 0 ? 'month' : containerWidth < 720 ? 'day' : containerWidth < 1100 ? 'week' : 'month';
  const viewMode = manualView ?? automaticView;
  const compactWeek = containerWidth > 0 && containerWidth < 760;
  const stackedToolbar = containerWidth > 0 && containerWidth < 640;

  const range = useMemo(() => viewRange(currentDate, viewMode, timezone), [currentDate, viewMode, timezone]);
  const weekStart = useMemo(() => startOfWeekInTimezone(currentDate, timezone), [currentDate, timezone]);
  const { data, loading } = useCalendarEvents(range.start, range.end);
  const events = data ?? EMPTY_EVENTS;
  const { data: sources = [], refetch: refetchSources } = useQuery<CalendarSource[]>(
    '/api/calendar/sources',
    () => api.get<CalendarSource[]>('/api/calendar/sources'),
    { staleTime: 60_000 },
  );

  const refreshEvents = () => {
    invalidateQueriesWithPrefix('/api/calendar/events');
    invalidateQueriesWithPrefix('/api/dashboard');
  };

  useWebSocket((msg) => {
    if (msg.type === 'calendar_synced') {
      refetchSources();
      const payload = msg.payload as { results?: SyncResult[] } | undefined;
      if (payload?.results) {
        setSyncing(false);
        const results = payload.results;
        setSyncStatus({ results, show: true });
        setTimeout(() => setSyncStatus(null), 6000);
      }
    }
  });

  const handleSync = async () => {
    setSyncing(true);
    setSyncStatus(null);
    try {
      await api.post('/api/calendar/sync', {});
    } catch {
      setSyncing(false);
      setSyncStatus({ results: [{ sourceName: 'All', eventCount: 0, error: 'Failed to start sync' }], show: true });
      setTimeout(() => setSyncStatus(null), 6000);
    }
  };

  const navigate = (dir: -1 | 1) => {
    const d = new Date(currentDate);
    if (viewMode === 'day') d.setDate(d.getDate() + dir);
    else if (viewMode === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCurrentDate(d);
  };

  const heading = (() => {
    if (viewMode === 'day') return formatDate(currentDate, timezone, { weekday: 'long', month: 'long', day: 'numeric' });
    if (viewMode === 'week') {
      const start = startOfWeekInTimezone(currentDate, timezone);
      const end = new Date(start); end.setDate(end.getDate() + 6);
      return `${formatDate(start, timezone, { month: 'short', day: 'numeric' })} – ${formatDate(end, timezone, { month: 'short', day: 'numeric' })}`;
    }
    return formatDate(currentDate, timezone, { month: 'long', year: 'numeric' });
  })();

  const showSpinner = loading && events.length === 0;
  const activeSources = sources.filter((source) => source.active);
  const allDayCount = events.filter((event) => event.allDay).length;

  return (
    <div ref={containerRef} className="relative flex h-full min-h-0 flex-col overflow-hidden p-[var(--page-gutter)]">
      <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      {/* Header bar */}
      <div className={`relative mb-3 shrink-0 gap-3 ${stackedToolbar ? 'flex flex-col' : 'flex items-end justify-between'}`}>
        {/* Left: nav arrows + heading + today */}
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-text-dim">
            <span>Family calendar</span>
            <span className="h-1 w-1 rounded-full bg-primary-light" />
            <span>{events.length} {events.length === 1 ? 'event' : 'events'}</span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex rounded-xl border border-border-subtle bg-surface-light/70 p-0.5 shadow-lg shadow-black/10 backdrop-blur">
              <button
                onClick={() => navigate(-1)}
                aria-label={`Previous ${viewMode}`}
                className="flex h-8 w-8 items-center justify-center rounded-[9px] text-text-dim transition-colors hover:bg-surface-lighter hover:text-text-bright"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <button
                onClick={() => navigate(1)}
                aria-label={`Next ${viewMode}`}
                className="flex h-8 w-8 items-center justify-center rounded-[9px] text-text-dim transition-colors hover:bg-surface-lighter hover:text-text-bright"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
            <h1 className="min-w-0 truncate text-xl font-bold tracking-[-0.03em] text-text-bright sm:text-2xl">{heading}</h1>
            <button
              onClick={() => setCurrentDate(todayInTimezone(timezone))}
              className="ml-1 shrink-0 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary-light transition-colors hover:border-primary/40 hover:bg-primary/20"
            >
              Today
            </button>
          </div>
        </div>

        {/* Right: view toggle + actions */}
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex rounded-xl border border-border-subtle bg-surface-light/70 p-1 backdrop-blur">
            {(['day', 'week', 'month'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setManualView(mode)}
                className={`rounded-lg px-2 py-1.5 text-xs font-semibold capitalize transition-all md:px-3 ${
                  viewMode === mode
                    ? 'bg-primary text-white shadow-md shadow-primary/20'
                    : 'text-text-dim hover:text-text-bright'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="hidden md:block w-px h-5 bg-surface-lighter mx-1" />

          {/* Sync */}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-transparent text-text-dim transition-colors hover:border-border-subtle hover:bg-surface-light hover:text-text-bright disabled:opacity-40"
            title="Sync calendars"
          >
            <svg className={syncing ? 'animate-spin' : ''} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>

          {/* Add event */}
          <button
            onClick={() => { setSelectedEvent(null); setAdding(true); }}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-dark hover:shadow-primary/30 active:scale-[0.97]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            <span className="hidden md:inline">Event</span>
          </button>
        </div>
      </div>

      {/* Sync status toast */}
      {syncStatus?.show && (
        <div className="mb-2 bg-surface-light rounded-xl px-4 py-2.5 flex items-center gap-4 text-sm shrink-0">
          {syncStatus.results.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${r.error ? 'bg-accent-red' : 'bg-accent-green'}`} />
              <span className="text-text-dim">{r.sourceName}</span>
              <span className={r.error ? 'text-accent-red' : 'text-text-dim'}>{r.error || `${r.eventCount}`}</span>
            </div>
          ))}
        </div>
      )}

      {!stackedToolbar && (activeSources.length > 0 || events.length > 0) && (
        <div className="relative mb-3 flex shrink-0 items-center gap-2 overflow-hidden text-xs">
          <span className="shrink-0 text-text-dim">Showing</span>
          <div className="scrollbar-hide flex min-w-0 items-center gap-1.5 overflow-x-auto">
            {activeSources.slice(0, 5).map((source) => (
              <span key={source.id} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-light/60 px-2.5 py-1 text-text-dim">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: source.color || '#7c83ff' }} />
                {source.name}
              </span>
            ))}
            {activeSources.length > 5 && <span className="shrink-0 text-text-dim">+{activeSources.length - 5}</span>}
          </div>
          <span className="ml-auto hidden shrink-0 text-text-dim lg:inline">{allDayCount ? `${allDayCount} all-day · ` : ''}{events.length - allDayCount} scheduled</span>
        </div>
      )}

      {/* Add event form */}
      {adding && (
        <div className="mb-3 shrink-0">
          <AddEventForm
            defaultDate={currentDate}
            sources={sources}
            onCreated={(event) => {
              setAdding(false);
              setCurrentDate(event.allDay ? todayInTimezone(timezone) : new Date(event.startAt));
              refreshEvents();
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {/* Calendar view */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-border bg-gradient-to-br from-panel-raised via-panel-raised to-panel p-2 shadow-2xl shadow-black/20 sm:p-3">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary-light/40 to-transparent" />
        {showSpinner ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {viewMode === 'day' && (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <DayView
                  date={currentDate}
                  events={events}
                  showHeader={false}
                  onDateChange={setCurrentDate}
                  onEventSelect={setSelectedEvent}
                />
              </div>
            )}
            {viewMode === 'week' && (
              <WeekView
                startDate={weekStart}
                events={events}
                onDateChange={setCurrentDate}
                onEventSelect={setSelectedEvent}
                showHeader={false}
                compact={compactWeek}
                fill
              />
            )}
            {viewMode === 'month' && (
              <MonthView
                date={currentDate}
                events={events}
                onDateChange={setCurrentDate}
                onDaySelect={(d) => {
                  setCurrentDate(d);
                  setManualView('day');
                }}
                onEventSelect={setSelectedEvent}
                showHeader={false}
              />
            )}
          </>
        )}
      </div>

      {/* Event detail modal */}
      {selectedEvent && (
        <EventDetail
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onUpdated={refreshEvents}
        />
      )}
    </div>
  );
}
