import { useEffect, useState, useCallback } from 'react';
import { api, type CalendarEvent, type CalendarSource } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import { DayView } from '../components/calendar/DayView';
import { WeekView } from '../components/calendar/WeekView';
import { MonthView } from '../components/calendar/MonthView';
import { AddEventForm } from '../components/calendar/AddEventForm';
import { EventDetail } from '../components/calendar/EventDetail';
import { endOfDayInTimezone, endOfMonthInTimezone, endOfWeekInTimezone, formatDate, startOfDayInTimezone, startOfMonthInTimezone, startOfWeekInTimezone, todayInTimezone, useTimezone } from '../lib/timezone';

type ViewMode = 'day' | 'week' | 'month';

interface SyncResult {
  sourceName: string;
  eventCount: number;
  error?: string;
}

export function Calendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ results: SyncResult[]; show: boolean } | null>(null);
  const [adding, setAdding] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const timezone = useTimezone();

  const loadEvents = useCallback(() => {
    let start = startOfDayInTimezone(currentDate, timezone);
    let end = endOfDayInTimezone(currentDate, timezone);

    if (viewMode === 'day') {
    } else if (viewMode === 'week') {
      start = startOfWeekInTimezone(currentDate, timezone);
      end = endOfWeekInTimezone(currentDate, timezone);
    } else {
      start = startOfMonthInTimezone(currentDate, timezone);
      end = endOfMonthInTimezone(currentDate, timezone);
    }

    api
      .get<CalendarEvent[]>(
        `/api/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`
      )
      .then(setEvents)
      .catch(() => {});
  }, [currentDate, viewMode, timezone]);

  useEffect(loadEvents, [loadEvents]);
  useEffect(() => { loadSources(); }, []);

  const loadSources = () => {
    api.get<CalendarSource[]>('/api/calendar/sources').then(setSources).catch(() => {});
  };

  useWebSocket((msg) => {
    if (msg.type === 'calendar_synced') {
      loadEvents();
      loadSources();
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

  return (
    <div className="flex flex-col h-full -m-4 p-4 overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        {/* Left: nav arrows + heading + today */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-dim hover:text-text-bright hover:bg-surface-lighter transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <button
            onClick={() => navigate(1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-dim hover:text-text-bright hover:bg-surface-lighter transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
          <h1 className="text-lg font-semibold text-text-bright ml-1">{heading}</h1>
          <button
            onClick={() => setCurrentDate(todayInTimezone(timezone))}
            className="ml-2 text-xs font-semibold text-primary-light bg-primary-light/10 hover:bg-primary-light/20 px-2.5 py-1 rounded-lg transition-colors"
          >
            Today
          </button>
        </div>

        {/* Right: view toggle + actions */}
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex bg-surface-lighter/50 rounded-lg p-0.5">
            {(['day', 'week', 'month'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${
                  viewMode === mode
                    ? 'bg-surface-light text-text-bright shadow-sm'
                    : 'text-text-dim hover:text-text-bright'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-surface-lighter mx-1" />

          {/* Sync */}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-dim hover:text-text-bright hover:bg-surface-lighter transition-colors disabled:opacity-40"
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
            className="h-8 flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white text-xs font-semibold px-3 rounded-lg transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Event
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

      {/* Add event form */}
      {adding && (
        <div className="mb-3 shrink-0">
          <AddEventForm
            defaultDate={currentDate}
            sources={sources}
            onCreated={(event) => {
              setAdding(false);
              setCurrentDate(event.allDay ? todayInTimezone(timezone) : new Date(event.startAt));
              loadEvents();
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {/* Calendar view */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-surface-light border border-surface-lighter p-4 flex flex-col">
        {viewMode === 'day' && (
          <DayView
            date={currentDate}
            events={events}
            onDateChange={setCurrentDate}
            onEventSelect={setSelectedEvent}
          />
        )}
        {viewMode === 'week' && (
          <WeekView
            startDate={startOfWeekInTimezone(currentDate, timezone)}
            events={events}
            onDateChange={setCurrentDate}
            onEventSelect={setSelectedEvent}
            showHeader={false}
          />
        )}
        {viewMode === 'month' && (
          <MonthView
            date={currentDate}
            events={events}
            onDateChange={setCurrentDate}
            onDaySelect={(d) => {
              setCurrentDate(d);
              setViewMode('day');
            }}
            onEventSelect={setSelectedEvent}
          />
        )}
      </div>

      {/* Event detail modal */}
      {selectedEvent && (
        <EventDetail
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
