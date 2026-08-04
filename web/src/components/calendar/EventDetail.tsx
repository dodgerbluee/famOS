import { useState } from 'react';
import { api, type CalendarEvent } from '../../api/client';
import { colorWithAlpha, formatCalendarLabel } from '../../lib/calendarDisplay';
import { formatCalendarEventDate } from '../../lib/calendar';
import { formatTime, getDateKey, useTimezone } from '../../lib/timezone';

interface EventDetailProps {
  event: CalendarEvent;
  onClose: () => void;
  onUpdated?: () => void;
}

export function EventDetail({ event, onClose, onUpdated }: EventDetailProps) {
  const timezone = useTimezone();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description);
  const [location, setLocation] = useState(event.location);
  const [date, setDate] = useState(getDateKey(event.startAt, timezone));
  const [startTime, setStartTime] = useState(formatTime(event.startAt, timezone, { hour: '2-digit', minute: '2-digit', hour12: false }));
  const [endTime, setEndTime] = useState(formatTime(event.endAt, timezone, { hour: '2-digit', minute: '2-digit', hour12: false }));
  const [allDay, setAllDay] = useState(event.allDay);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const displayStartTime = event.allDay ? 'All Day' : formatTime(event.startAt, timezone);
  const displayEndTime = event.allDay ? '' : formatTime(event.endAt, timezone);
  const dateStr = formatCalendarEventDate(event, timezone, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError('');
    try {
      const startAt = allDay ? `${date}T00:00` : `${date}T${startTime}`;
      const endAt = allDay ? `${date}T23:59` : `${date}T${endTime}`;
      await api.put(`/api/calendar/events/${event.id}`, {
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        startAt,
        endAt,
        allDay,
      });
      onUpdated?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/calendar/events/${event.id}`);
      onUpdated?.();
      onClose();
    } catch {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-xl font-bold text-text-bright bg-surface-light rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
            ) : (
              <>
                <h3 className="text-xl font-bold text-text-bright">{event.title}</h3>
                <p className="text-text-dim text-sm mt-1">{dateStr}</p>
                <p className="text-text-dim text-sm">
                  {displayStartTime}{displayEndTime ? ` – ${displayEndTime}` : ''}
                </p>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-text-dim text-2xl leading-none p-2 -mr-2 -mt-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {editing ? (
          <>
            <label className="flex items-center gap-3 py-1">
              <div
                role="switch"
                aria-checked={allDay}
                onClick={() => setAllDay(!allDay)}
                className={`relative w-11 h-6 rounded-full cursor-pointer transition-colors ${allDay ? 'bg-primary' : 'bg-surface-lighter'}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${allDay ? 'translate-x-5' : ''}`} />
              </div>
              <span className="text-sm text-text-bright">All day</span>
            </label>

            <div>
              <label className="block text-sm text-text-dim mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-surface-light text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {!allDay && (
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
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-primary text-white font-bold py-3 rounded-xl min-h-[48px] active:scale-95 transition-transform disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => { setEditing(false); setError(''); }}
                className="px-4 py-3 rounded-xl text-text-dim font-medium min-h-[48px]"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            {event.location && (
              <div>
                <p className="text-text-dim text-xs uppercase tracking-wide mb-0.5">Location</p>
                <p className="text-text-bright text-sm">{event.location}</p>
              </div>
            )}

            {event.description && (
              <div>
                <p className="text-text-dim text-xs uppercase tracking-wide mb-0.5">Description</p>
                <p className="text-text-bright text-sm whitespace-pre-wrap">{event.description}</p>
              </div>
            )}

            {event.sourceName && (
              <div className="flex flex-wrap gap-2">
                <span
                  className="inline-block text-xs px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: colorWithAlpha(event.sourceColor || '#6366f1'),
                    color: event.sourceColor || '#6366f1',
                  }}
                >
                  {formatCalendarLabel(event.sourceName)}
                </span>
                {event.sourceCalendarName && (
                  <span
                    className="inline-block text-xs px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: colorWithAlpha(event.sourceCalendarColor || event.sourceColor || '#6366f1'),
                      color: event.sourceCalendarColor || event.sourceColor || '#6366f1',
                    }}
                  >
                    {formatCalendarLabel(event.sourceCalendarName)}
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2 border-t border-surface-lighter">
              <button
                onClick={() => setEditing(true)}
                className="text-primary-light text-sm font-medium min-h-[44px]"
              >
                Edit
              </button>
              {confirmDelete ? (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-text-dim text-sm">Delete?</span>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-accent-red text-sm font-medium min-h-[44px] disabled:opacity-50"
                  >
                    {deleting ? 'Deleting...' : 'Yes'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-text-dim text-sm min-h-[44px]"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-accent-red text-sm ml-auto min-h-[44px]"
                >
                  Delete
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
