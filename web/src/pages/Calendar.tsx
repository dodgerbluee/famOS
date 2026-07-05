import { useEffect, useState, useCallback } from 'react';
import { api, type CalendarEvent, type CalendarSource } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import { DayView } from '../components/calendar/DayView';
import { WeekView } from '../components/calendar/WeekView';
import { MonthView } from '../components/calendar/MonthView';
import { AddEventForm } from '../components/calendar/AddEventForm';
import { EventDetail } from '../components/calendar/EventDetail';
import { endOfDayInTimezone, endOfMonthInTimezone, endOfWeekInTimezone, startOfDayInTimezone, startOfMonthInTimezone, startOfWeekInTimezone, todayInTimezone, useTimezone } from '../lib/timezone';

type ViewMode = 'day' | 'week' | 'month';

export function Calendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [syncing, setSyncing] = useState(false);
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
  useEffect(() => {
    api.get<CalendarSource[]>('/api/calendar/sources').then(setSources).catch(() => {});
  }, []);

  useWebSocket((msg) => {
    if (msg.type === 'calendar_synced') {
      loadEvents();
    }
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.post('/api/calendar/sync', {});
      setTimeout(loadEvents, 2000);
    } finally {
      setTimeout(() => setSyncing(false), 3000);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-bright">Calendar</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSelectedEvent(null);
              setAdding(true);
            }}
            className="bg-primary text-white text-sm font-medium px-3 py-2 min-h-[44px] rounded-xl active:scale-95 transition-transform"
          >
            + Event
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="text-primary-light text-sm font-medium px-3 py-2 min-h-[44px] disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
          <button
            onClick={() => setCurrentDate(todayInTimezone(timezone))}
            className="text-primary-light text-sm font-medium px-3 py-2 min-h-[44px]"
          >
            Today
          </button>
        </div>
      </div>

      {adding && (
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
      )}

      <div className="flex bg-surface rounded-xl p-1 gap-1">
        {(['day', 'week', 'month'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`flex-1 py-2 rounded-lg font-medium capitalize transition-colors min-h-[44px] ${
              viewMode === mode
                ? 'bg-primary text-white'
                : 'text-text-dim'
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="bg-surface rounded-2xl p-4">
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

      {selectedEvent && (
        <EventDetail
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
