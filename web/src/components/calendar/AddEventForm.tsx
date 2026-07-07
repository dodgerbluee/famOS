import { useEffect, useMemo, useState } from 'react';
import { api, type CalendarEvent, type CalendarSource, type RemoteCalendar } from '../../api/client';
import { getDateKey, useTimezone } from '../../lib/timezone';

interface AddEventFormProps {
  defaultDate: Date;
  sources: CalendarSource[];
  onCreated: (event: CalendarEvent) => void;
  onCancel: () => void;
}

export function AddEventForm({ defaultDate, sources, onCreated, onCancel }: AddEventFormProps) {
  const timezone = useTimezone();
  const dateStr = getDateKey(defaultDate, timezone);
  const writableSources = sources.filter((source) => source.type === 'caldav' && source.active);

  const [sourceId, setSourceId] = useState(writableSources[0]?.id ?? '');
  const selectedSource = useMemo(
    () => writableSources.find((source) => source.id === sourceId) ?? null,
    [sourceId, writableSources],
  );
  const [remoteCalendars, setRemoteCalendars] = useState<RemoteCalendar[]>([]);
  const [selectedCalendarName, setSelectedCalendarName] = useState('');
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(dateStr);
  const [endDate, setEndDate] = useState(dateStr);
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sourceId) {
      setRemoteCalendars([]);
      setSelectedCalendarName('');
      return;
    }

    setLoadingCalendars(true);
    setError('');
    api.get<RemoteCalendar[]>(`/api/calendar/sources/${sourceId}/remote-calendars`)
      .then((calendars) => {
        setRemoteCalendars(calendars);
        const preferred = selectedSource?.calendarName || '';
        const match = calendars.find((calendar) => calendar.name === preferred);
        setSelectedCalendarName(match?.name || calendars[0]?.name || '');
      })
      .catch((e) => {
        setRemoteCalendars([]);
        setSelectedCalendarName('');
        setError(e instanceof Error ? e.message : 'Failed to load calendars');
      })
      .finally(() => setLoadingCalendars(false));
  }, [sourceId, selectedSource?.calendarName]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!sourceId) {
      setError('Choose a calendar');
      return;
    }
    if (remoteCalendars.length > 0 && !selectedCalendarName) {
      setError('Choose a calendar option');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const startAt = allDay ? `${date}T00:00` : `${date}T${startTime}`;
      const endAt = allDay ? `${endDate}T23:59` : `${date}T${endTime}`;

      if (!allDay && endAt <= startAt) {
        setError('End time must be after start time');
        setSaving(false);
        return;
      }
      if (allDay && endDate < date) {
        setError('End date must be on or after start date');
        setSaving(false);
        return;
      }

      const ev = await api.post<CalendarEvent>('/api/calendar/events', {
        sourceId,
        calendarName: selectedCalendarName,
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        startAt,
        endAt: endAt || undefined,
        allDay,
      });
      onCreated(ev);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create event');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="w-full max-w-lg rounded-2xl bg-surface p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-bright">New Event</h3>
          <button
            type="button"
            onClick={onCancel}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center text-2xl leading-none text-text-dim"
          >
            ×
          </button>
        </div>

        <div>
          <label className="block text-sm text-text-dim mb-1">Calendar</label>
          <div className="relative">
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="w-full appearance-none bg-surface-light text-text-bright rounded-xl px-4 py-3 pr-11 outline-none focus:ring-2 focus:ring-primary border border-transparent focus:border-primary/40"
            >
              {writableSources.map((source) => (
                <option key={source.id} value={source.id}>{source.name}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-text-dim">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        </div>

        {sourceId && (
          <div>
            <label className="block text-sm text-text-dim mb-1">Calendar Option</label>
            <div className="relative">
              <select
                value={selectedCalendarName}
                onChange={(e) => setSelectedCalendarName(e.target.value)}
                disabled={loadingCalendars || remoteCalendars.length === 0}
                className="w-full appearance-none bg-surface-light text-text-bright rounded-xl px-4 py-3 pr-11 outline-none focus:ring-2 focus:ring-primary border border-transparent focus:border-primary/40 disabled:opacity-50"
              >
                {remoteCalendars.map((calendar) => (
                  <option key={calendar.path} value={calendar.name}>{calendar.name}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-text-dim">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
            <p className="text-text-dim text-xs mt-1">
              {loadingCalendars
                ? 'Loading remote calendars...'
                : remoteCalendars.length > 0
                  ? 'This is the specific calendar the event will be saved to.'
                  : 'No remote calendars found for this source.'}
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm text-text-dim mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Event title"
            autoFocus
            className="w-full bg-surface-light text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <label className="flex items-center gap-3 py-1">
        <div
          role="switch"
          aria-checked={allDay}
          onClick={() => setAllDay(!allDay)}
          className={`relative w-11 h-6 rounded-full cursor-pointer transition-colors ${
            allDay ? 'bg-primary' : 'bg-surface-lighter'
          }`}
        >
          <div
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              allDay ? 'translate-x-5' : ''
            }`}
          />
        </div>
        <span className="text-sm text-text-bright">All day</span>
        </label>

        {allDay ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-text-dim mb-1">Start Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  if (e.target.value > endDate) setEndDate(e.target.value);
                }}
                className="w-full bg-surface-light text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm text-text-dim mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                min={date}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-surface-light text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm text-text-dim mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-surface-light text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-text-dim mb-1">Start</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full bg-surface-light text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm text-text-dim mb-1">End</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full bg-surface-light text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          </>
        )}

        <div>
          <label className="block text-sm text-text-dim mb-1">Location</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Optional"
            className="w-full bg-surface-light text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-sm text-text-dim mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
            rows={2}
            className="w-full bg-surface-light text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        {error && <p className="text-accent-red text-sm">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || writableSources.length === 0 || loadingCalendars || (remoteCalendars.length > 0 && !selectedCalendarName)}
            className="flex-1 bg-primary text-white font-bold py-3 rounded-xl min-h-[48px] active:scale-95 transition-transform disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Add Event'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-3 rounded-xl text-text-dim font-medium min-h-[48px]"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
