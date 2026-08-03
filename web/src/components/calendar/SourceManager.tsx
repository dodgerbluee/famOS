import { useEffect, useState } from 'react';
import { api, type CalendarSource } from '../../api/client';
import { formatCalendarLabel } from '../../lib/calendarDisplay';
import { useWebSocket } from '../../hooks/useWebSocket';
import { formatDate, useTimezone } from '../../lib/timezone';

const SOURCE_COLORS = ['#f38ba8', '#89b4fa', '#a6e3a1', '#f9e2af', '#f5c2e7', '#fab387', '#94e2d5', '#cba6f7'];

interface EditPopupProps {
  source: CalendarSource;
  form: typeof EMPTY_FORM;
  setForm: (f: typeof EMPTY_FORM) => void;
  onSave: (e: React.FormEvent) => void;
  onDelete: () => void;
  onClose: () => void;
}

const EMPTY_FORM = {
  name: '',
  type: 'ics_url' as 'caldav' | 'ics_url' | 'google_calendar',
  url: '',
  calendarName: '',
  username: '',
  password: '',
  color: SOURCE_COLORS[0],
  syncInterval: 5,
  active: true,
};

function SourceEditPopup({ source, form, setForm, onSave, onDelete, onClose }: EditPopupProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl bg-surface p-4 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-bright">Edit {source.name}</h3>
          <button type="button" onClick={onClose} className="flex min-h-[44px] min-w-[44px] items-center justify-center text-2xl leading-none text-text-dim">×</button>
        </div>

        <form onSubmit={onSave} className="space-y-3">
          <input type="text" placeholder="Display name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-surface-light text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" required />

          <div className="flex gap-2">
            {(['ics_url', 'google_calendar', 'caldav'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setForm({ ...form, type: t })} className={`flex-1 py-3 rounded-lg font-medium transition-colors min-h-[48px] ${form.type === t ? 'bg-primary text-white' : 'bg-surface-light text-text-dim'}`}>
                {t === 'ics_url' ? 'ICS URL' : t === 'google_calendar' ? 'Google Calendar' : 'CalDAV'}
              </button>
            ))}
          </div>

          <input type="url" placeholder={form.type === 'caldav' ? 'Specific calendar URL or CalDAV account URL' : form.type === 'google_calendar' ? 'Google Calendar ICS URL' : 'ICS feed URL'} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="w-full bg-surface-light text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" required />

          {form.type === 'google_calendar' && (
            <p className="text-text-dim text-xs">Paste the Google Calendar private secret ICS URL from Google Calendar settings.</p>
          )}

          {form.type === 'caldav' && (
            <>
              <input type="text" placeholder="Specific calendar name on the account (optional)" value={form.calendarName} onChange={(e) => setForm({ ...form, calendarName: e.target.value })} className="w-full bg-surface-light text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" />
              <div className="flex gap-3">
                <input type="text" placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="flex-1 bg-surface-light text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" />
                <input type="password" placeholder="Leave blank to keep password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="flex-1 bg-surface-light text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-text-dim mb-1">Sync Interval (min)</label>
              <input type="number" min={1} value={form.syncInterval} onChange={(e) => setForm({ ...form, syncInterval: Number(e.target.value) || 5 })} className="w-full bg-surface-light text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <label className="flex items-center gap-3 py-8">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              <span className="text-text-bright text-sm">Active</span>
            </label>
          </div>

          <div>
            <label className="block text-sm text-text-dim mb-1">Color</label>
            <div className="flex gap-2">
              {SOURCE_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setForm({ ...form, color: c })} className={`w-8 h-8 rounded-full transition-transform ${form.color === c ? 'scale-125 ring-2 ring-white' : ''}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          <button type="submit" className="w-full bg-accent-green text-bg font-bold py-3 rounded-xl min-h-[48px]">Save Changes</button>
        </form>

        <div className="pt-2 border-t border-surface-lighter">
          {confirmDelete ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-dim">Remove this source and all its events?</p>
              <div className="flex gap-2">
                <button onClick={onDelete} className="text-accent-red text-sm font-medium px-3 py-2 min-h-[44px]">Yes, Remove</button>
                <button onClick={() => setConfirmDelete(false)} className="text-text-dim text-sm px-3 py-2 min-h-[44px]">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="text-accent-red text-sm px-1 py-2 min-h-[44px]">Remove Source</button>
          )}
        </div>
      </div>
    </div>
  );
}

export function SourceManager() {
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [editingSource, setEditingSource] = useState<CalendarSource | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncErrors, setSyncErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const timezone = useTimezone();

  const load = () => {
    api.get<CalendarSource[]>('/api/calendar/sources').then(setSources).catch(() => {});
  };

  useEffect(load, []);

  useWebSocket((msg) => {
    if (msg.type === 'calendar_synced') {

      setSyncingAll(false);
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

      setSyncingAll(false);
      load();
      const payload = msg.payload as { sourceId?: string; error?: string } | undefined;
      if (payload?.sourceId && payload?.error) {
        setSyncErrors(prev => ({ ...prev, [payload.sourceId!]: payload.error! }));
        setTimeout(() => setSyncErrors({}), 10000);
      }
    }
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/api/calendar/sources', form);
    setForm({ ...EMPTY_FORM });
    setShowAddForm(false);
    load();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSource) return;
    const payload: Record<string, unknown> = {
      name: form.name, type: form.type, url: form.url, calendarName: form.calendarName,
      username: form.username, color: form.color, syncInterval: form.syncInterval, active: form.active,
    };
    if (form.password) payload.password = form.password;
    await api.put(`/api/calendar/sources/${editingSource.id}`, payload);
    setEditingSource(null);
    setForm({ ...EMPTY_FORM });
    load();
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/api/calendar/sources/${id}`);
    setEditingSource(null);
    load();
  };

  const handleSyncAll = async () => {
    if (syncingAll) return;
    setSyncingAll(true);
    await api.post('/api/calendar/sync', {}).catch(() => setSyncingAll(false));
  };

  const openEdit = (src: CalendarSource) => {
    setEditingSource(src);
    setForm({
      name: src.name, type: src.type, url: src.url, calendarName: src.calendarName || '',
      username: src.username || '', password: '', color: src.color, syncInterval: src.syncIntervalMin, active: src.active,
    });
  };

  return (
    <div className="bg-surface rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text-bright">Calendar Sources</h2>
        <button
          onClick={handleSyncAll}
          disabled={syncingAll}
          className="text-primary-light text-sm font-medium px-3 py-2 min-h-[44px] disabled:opacity-50"
        >
          {syncingAll ? 'Syncing...' : 'Sync All'}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {sources.map((src) => (
          <button
            key={src.id}
            onClick={() => openEdit(src)}
            className="bg-surface-light rounded-xl p-3 text-left transition-colors hover:bg-surface-lighter active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: src.color }} />
              <p className="text-text-bright font-medium text-sm truncate">{src.name}</p>
            </div>
            <p className="text-text-dim text-xs">
              {src.type === 'caldav' ? 'CalDAV' : src.type === 'google_calendar' ? 'Google' : 'ICS'}
              {src.calendarName && ` · ${formatCalendarLabel(src.calendarName)}`}
            </p>
            {src.lastSyncedAt && (
              <p className="text-text-dim text-xs mt-1">
                {formatDate(parseSqliteUtc(src.lastSyncedAt), timezone, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </p>
            )}
            {!src.active && <p className="text-accent-red text-xs mt-1">Disabled</p>}
            {syncErrors[src.id] && <p className="text-accent-red text-xs mt-1 truncate">{syncErrors[src.id]}</p>}

          </button>
        ))}

        {showAddForm ? (
          <div className="bg-surface-light rounded-xl p-3 col-span-2 md:col-span-4">
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text-bright">New Calendar Source</h3>
                <button type="button" onClick={() => { setShowAddForm(false); setForm({ ...EMPTY_FORM }); }} className="text-text-dim text-sm px-2 py-1 min-h-[44px]">Cancel</button>
              </div>

              <input type="text" placeholder="Display name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" required />

              <div className="flex gap-2">
                {(['ics_url', 'google_calendar', 'caldav'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setForm({ ...form, type: t })} className={`flex-1 py-3 rounded-lg font-medium transition-colors min-h-[48px] text-sm ${form.type === t ? 'bg-primary text-white' : 'bg-surface-lighter text-text-dim'}`}>
                    {t === 'ics_url' ? 'ICS URL' : t === 'google_calendar' ? 'Google' : 'CalDAV'}
                  </button>
                ))}
              </div>

              <input type="url" placeholder={form.type === 'caldav' ? 'CalDAV URL' : form.type === 'google_calendar' ? 'Google Calendar ICS URL' : 'ICS feed URL'} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" required />

              {form.type === 'google_calendar' && (
                <p className="text-text-dim text-xs">Paste the private secret ICS URL from Google Calendar settings.</p>
              )}

              {form.type === 'caldav' && (
                <>
                  <input type="text" placeholder="Calendar name (optional)" value={form.calendarName} onChange={(e) => setForm({ ...form, calendarName: e.target.value })} className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" />
                  <div className="flex gap-3">
                    <input type="text" placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="flex-1 bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" />
                    <input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="flex-1 bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-text-dim mb-1">Sync Interval (min)</label>
                  <input type="number" min={1} value={form.syncInterval} onChange={(e) => setForm({ ...form, syncInterval: Number(e.target.value) || 5 })} className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <label className="flex items-center gap-3 py-8">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                  <span className="text-text-bright text-sm">Active</span>
                </label>
              </div>

              <div>
                <label className="block text-sm text-text-dim mb-1">Color</label>
                <div className="flex gap-2">
                  {SOURCE_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setForm({ ...form, color: c })} className={`w-8 h-8 rounded-full transition-transform ${form.color === c ? 'scale-125 ring-2 ring-white' : ''}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>

              <button type="submit" className="w-full bg-accent-green text-bg font-bold py-3 rounded-xl min-h-[48px]">Add Calendar</button>
            </form>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-surface-light rounded-xl p-3 flex flex-col items-center justify-center gap-2 text-text-dim hover:text-text-bright hover:bg-surface-lighter transition-colors min-h-[100px] border-2 border-dashed border-surface-lighter"
          >
            <span className="text-2xl leading-none">+</span>
            <span className="text-sm font-medium">Add Source</span>
          </button>
        )}
      </div>

      {editingSource && (
        <SourceEditPopup
          source={editingSource}
          form={form}
          setForm={setForm}
          onSave={handleUpdate}
          onDelete={() => handleDelete(editingSource.id)}
          onClose={() => { setEditingSource(null); setForm({ ...EMPTY_FORM }); }}
        />
      )}
    </div>
  );
}

function parseSqliteUtc(value: string) {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return value.replace(' ', 'T') + 'Z';
  }
  return value;
}
