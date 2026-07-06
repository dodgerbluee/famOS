import { useEffect, useState } from 'react';
import { api, type CalendarSource } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';
import { formatDate, useTimezone } from '../../lib/timezone';

const SOURCE_COLORS = ['#f38ba8', '#89b4fa', '#a6e3a1', '#f9e2af', '#f5c2e7', '#fab387', '#94e2d5', '#cba6f7'];

export function SourceManager() {
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncErrors, setSyncErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: '',
    type: 'ics_url' as 'caldav' | 'ics_url',
    url: '',
    calendarName: '',
    username: '',
    password: '',
    color: SOURCE_COLORS[0],
    syncInterval: 5,
    active: true,
  });
  const timezone = useTimezone();

  const load = () => {
    api.get<CalendarSource[]>('/api/calendar/sources').then(setSources).catch(() => {});
  };

  useEffect(load, []);

  useWebSocket((msg) => {
    if (msg.type === 'calendar_synced') {
      setSyncingId(null);
      load();
      const payload = msg.payload as { results?: { sourceId: string; error?: string }[] } | undefined;
      if (payload?.results) {
        const errors: Record<string, string> = {};
        for (const r of payload.results) {
          if (r.error) errors[r.sourceId] = r.error;
        }
        setSyncErrors(errors);
        if (Object.keys(errors).length > 0) {
          setTimeout(() => setSyncErrors({}), 10000);
        }
      }
    }
    if (msg.type === 'calendar_sync_error') {
      setSyncingId(null);
      load();
      const payload = msg.payload as { sourceId?: string; error?: string } | undefined;
      if (payload?.sourceId && payload?.error) {
        setSyncErrors(prev => ({ ...prev, [payload.sourceId!]: payload.error! }));
        setTimeout(() => setSyncErrors({}), 10000);
      }
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/api/calendar/sources', form);
    resetForm();
    setShowForm(false);
    load();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const payload: Record<string, unknown> = {
      name: form.name,
      type: form.type,
      url: form.url,
      calendarName: form.calendarName,
      username: form.username,
      color: form.color,
      syncInterval: form.syncInterval,
      active: form.active,
    };
    if (form.password) {
      payload.password = form.password;
    }
    await api.put(`/api/calendar/sources/${editingId}`, payload);
    resetForm();
    setEditingId(null);
    setShowForm(false);
    load();
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/api/calendar/sources/${id}`);
    load();
  };

  const handleResync = async (id: string) => {
    if (syncingId) return;
    setSyncingId(id);
    await api.post(`/api/calendar/sources/${id}/sync`, {}).catch(() => {
      setSyncingId(null);
    });
  };

  const startEdit = (src: CalendarSource) => {
    setEditingId(src.id);
    setShowForm(true);
    setForm({
      name: src.name,
      type: src.type,
      url: src.url,
      calendarName: src.calendarName || '',
      username: src.username || '',
      password: '',
      color: src.color,
      syncInterval: src.syncIntervalMin,
      active: src.active,
    });
  };

  const resetForm = () => {
    setForm({ name: '', type: 'ics_url', url: '', calendarName: '', username: '', password: '', color: SOURCE_COLORS[0], syncInterval: 5, active: true });
  };

  return (
    <div className="bg-surface rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text-bright">Calendar Sources</h2>
        <button
          onClick={() => {
            if (showForm && !editingId) {
              setShowForm(false);
              resetForm();
              return;
            }
            setEditingId(null);
            resetForm();
            setShowForm(true);
          }}
          className="bg-primary text-white px-4 py-2 rounded-xl font-medium min-h-[48px] active:scale-95 transition-transform"
        >
          {showForm ? 'Cancel' : 'Add Source'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={editingId ? handleUpdate : handleSubmit} className="space-y-3 mb-6 bg-surface-light rounded-xl p-4">
          <input
            type="text"
            placeholder="Display name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
            required
          />

          <div className="flex gap-2">
            {(['ics_url', 'caldav'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm({ ...form, type: t })}
                className={`flex-1 py-3 rounded-lg font-medium transition-colors min-h-[48px] ${
                  form.type === t ? 'bg-primary text-white' : 'bg-surface-lighter text-text-dim'
                }`}
              >
                {t === 'ics_url' ? 'ICS URL' : 'CalDAV'}
              </button>
            ))}
          </div>

          <input
            type="url"
            placeholder={form.type === 'caldav' ? 'Specific calendar URL or CalDAV account URL' : 'ICS feed URL'}
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
            required
          />

          {form.type === 'caldav' && (
            <>
              <input
                type="text"
                placeholder="Specific calendar name on the account (optional)"
                value={form.calendarName}
                onChange={(e) => setForm({ ...form, calendarName: e.target.value })}
                className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
              />
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="flex-1 bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
                />
                <input
                  type="password"
                  placeholder={editingId ? 'Leave blank to keep password' : 'Password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="flex-1 bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-text-dim mb-1">Sync Interval (min)</label>
              <input
                type="number"
                min={1}
                value={form.syncInterval}
                onChange={(e) => setForm({ ...form, syncInterval: Number(e.target.value) || 5 })}
                className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <label className="flex items-center gap-3 py-8">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              <span className="text-text-bright text-sm">Active</span>
            </label>
          </div>

          <div>
            <label className="block text-sm text-text-dim mb-1">Color</label>
            <div className="flex gap-2">
              {SOURCE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={`w-8 h-8 rounded-full transition-transform ${
                    form.color === c ? 'scale-125 ring-2 ring-white' : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-accent-green text-bg font-bold py-3 rounded-xl min-h-[48px]"
          >
            {editingId ? 'Save Changes' : 'Add Calendar'}
          </button>
        </form>
      )}

      <div className="space-y-2">
        {sources.map((src) => (
          <div key={src.id} className="bg-surface-light rounded-xl p-3">
            <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: src.color }} />
            <div className="flex-1">
              <p className="text-text-bright font-medium">{src.name}</p>
              <p className="text-text-dim text-xs">
                {src.type === 'caldav' ? 'CalDAV' : 'ICS URL'}
                {src.calendarName && ` · Calendar: ${src.calendarName}`}
                {src.lastSyncedAt && ` · Last sync: ${formatDate(parseSqliteUtc(src.lastSyncedAt), timezone, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
              </p>
            </div>
            <button
              onClick={() => startEdit(src)}
              className="text-primary-light text-sm px-3 py-2 min-h-[48px]"
            >
              Edit
            </button>
            <button
              onClick={() => handleResync(src.id)}
              disabled={syncingId === src.id}
              className="text-accent-green text-sm px-3 py-2 min-h-[48px] disabled:opacity-50"
            >
              {syncingId === src.id ? 'Syncing...' : 'Resync'}
            </button>
            <button
              onClick={() => handleDelete(src.id)}
              className="text-accent-red text-sm px-3 py-2 min-h-[48px]"
            >
              Remove
            </button>
            </div>
            {syncErrors[src.id] && (
              <p className="text-accent-red text-xs mt-2 pl-7">{syncErrors[src.id]}</p>
            )}
          </div>
        ))}
        {sources.length === 0 && (
          <p className="text-text-dim text-center py-4">No calendar sources — add one above</p>
        )}
      </div>
    </div>
  );
}

function parseSqliteUtc(value: string) {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return value.replace(' ', 'T') + 'Z';
  }
  return value;
}
