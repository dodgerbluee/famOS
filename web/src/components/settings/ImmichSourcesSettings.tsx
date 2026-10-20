import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface ImmichSource {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  albumId: string;
  enabled: boolean;
}

interface TestResult {
  ok: boolean;
  message: string;
  albumName?: string;
  photoCount?: number;
}

const inputClass = 'w-full bg-surface text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary';

export function ImmichSourcesSettings() {
  const [sources, setSources] = useState<ImmichSource[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [newAlbumId, setNewAlbumId] = useState('');
  const [addTesting, setAddTesting] = useState(false);
  const [addTestResult, setAddTestResult] = useState<TestResult | null>(null);
  const [saving, setSaving] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<ImmichSource | null>(null);
  const [editTesting, setEditTesting] = useState(false);
  const [editTestResult, setEditTestResult] = useState<TestResult | null>(null);

  // Per-row test feedback
  const [rowTest, setRowTest] = useState<Record<string, TestResult | null>>({});
  const [rowTesting, setRowTesting] = useState<string | null>(null);

  const load = () => {
    api.get<ImmichSource[]>('/api/immich/sources')
      .then(setSources)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const resetAddForm = () => {
    setAdding(false);
    setNewName('');
    setNewUrl('');
    setNewApiKey('');
    setNewAlbumId('');
    setAddTestResult(null);
  };

  const testNew = async () => {
    setAddTesting(true);
    setAddTestResult(null);
    try {
      const res = await api.post<TestResult>('/api/immich/sources/test', {
        url: newUrl, apiKey: newApiKey, albumId: newAlbumId,
      });
      setAddTestResult(res);
    } catch (e) {
      setAddTestResult({ ok: false, message: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setAddTesting(false);
    }
  };

  const saveNew = async () => {
    setSaving(true);
    try {
      await api.post('/api/immich/sources', {
        name: newName || 'Immich Album',
        url: newUrl,
        apiKey: newApiKey,
        albumId: newAlbumId,
        enabled: true,
      });
      resetAddForm();
      load();
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  const startEdit = (s: ImmichSource) => {
    setEditingId(s.id);
    setEdit({ ...s });
    setEditTestResult(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEdit(null);
    setEditTestResult(null);
  };

  const testEdit = async () => {
    if (!edit) return;
    setEditTesting(true);
    setEditTestResult(null);
    try {
      const res = await api.post<TestResult>('/api/immich/sources/test', {
        url: edit.url, apiKey: edit.apiKey, albumId: edit.albumId,
      });
      setEditTestResult(res);
    } catch (e) {
      setEditTestResult({ ok: false, message: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setEditTesting(false);
    }
  };

  const saveEdit = async () => {
    if (!edit) return;
    try {
      await api.put(`/api/immich/sources/${edit.id}`, {
        name: edit.name,
        url: edit.url,
        apiKey: edit.apiKey,
        albumId: edit.albumId,
      });
      cancelEdit();
      load();
    } catch { /* ignore */ }
  };

  const toggleEnabled = async (s: ImmichSource) => {
    await api.put(`/api/immich/sources/${s.id}`, { enabled: !s.enabled });
    load();
  };

  const removeSource = async (id: string) => {
    await api.delete(`/api/immich/sources/${id}`);
    load();
  };

  const testRow = async (id: string) => {
    setRowTesting(id);
    setRowTest((prev) => ({ ...prev, [id]: null }));
    try {
      const res = await api.post<TestResult>(`/api/immich/sources/${id}/test`, {});
      setRowTest((prev) => ({ ...prev, [id]: res }));
    } catch (e) {
      setRowTest((prev) => ({ ...prev, [id]: { ok: false, message: e instanceof Error ? e.message : 'Request failed' } }));
    } finally {
      setRowTesting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-text-dim text-sm">
          Add one or more Immich albums. Each can be a different account or server. Photos from all enabled albums are combined in the screensaver.
        </p>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="bg-primary text-white text-sm px-4 py-2 rounded-xl font-medium min-h-[44px] active:scale-95 transition-transform shrink-0 ml-3"
          >
            + Add Album
          </button>
        )}
      </div>

      {loading && <p className="text-text-dim text-sm">Loading…</p>}

      {sources.map((s) => {
        const result = rowTest[s.id];
        return (
          <div key={s.id} className="bg-surface-lighter rounded-xl p-4 space-y-3">
            {editingId === s.id && edit ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-text-dim mb-1">Name</label>
                  <input type="text" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Family, Wife's Album" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm text-text-dim mb-1">Immich URL</label>
                  <input type="url" value={edit.url} onChange={(e) => setEdit({ ...edit, url: e.target.value })} placeholder="https://immich.example.com" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm text-text-dim mb-1">API Key</label>
                  <input type="password" value={edit.apiKey} onChange={(e) => setEdit({ ...edit, apiKey: e.target.value })} placeholder="From Immich > Account Settings > API Keys" autoComplete="off" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm text-text-dim mb-1">Album ID</label>
                  <input type="text" value={edit.albumId} onChange={(e) => setEdit({ ...edit, albumId: e.target.value })} placeholder="UUID from Immich album URL" className={inputClass} />
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <button onClick={saveEdit} className="bg-accent-green text-bg px-4 py-2 rounded-xl font-medium min-h-[44px] active:scale-95 transition-transform">Save</button>
                  <button onClick={testEdit} disabled={editTesting || !edit.url} className="bg-surface text-text-bright px-4 py-2 rounded-xl font-medium min-h-[44px] active:scale-95 transition-transform disabled:opacity-50">
                    {editTesting ? 'Testing…' : 'Test'}
                  </button>
                  <button onClick={cancelEdit} className="text-text-dim text-sm px-2">Cancel</button>
                  {editTestResult && <span className={`text-sm ${editTestResult.ok ? 'text-accent-green' : 'text-accent-red'}`}>{editTestResult.message}</span>}
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-text-bright font-medium truncate">
                      {s.name}
                      {!s.enabled && <span className="ml-2 text-text-dim text-xs bg-surface px-2 py-0.5 rounded-lg">Disabled</span>}
                    </p>
                    <p className="text-text-dim text-xs truncate">{s.url}</p>
                    <p className="text-text-dim text-xs truncate">Album: {s.albumId || <span className="text-accent-red">not set</span>}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleEnabled(s)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium min-h-[36px] transition-colors ${s.enabled ? 'bg-accent-green/10 text-accent-green' : 'border border-surface-light text-text-dim hover:text-text-bright'}`}
                    >
                      {s.enabled ? 'Enabled' : 'Enable'}
                    </button>
                    <button onClick={() => startEdit(s)} className="text-primary-light text-xs font-medium min-h-[36px] px-2">Edit</button>
                    <button onClick={() => removeSource(s.id)} className="text-accent-red text-xs font-medium min-h-[36px] px-2">Remove</button>
                  </div>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <button
                    onClick={() => testRow(s.id)}
                    disabled={rowTesting === s.id}
                    className="bg-surface text-text-bright px-4 py-2 rounded-xl font-medium min-h-[40px] active:scale-95 transition-transform disabled:opacity-50"
                  >
                    {rowTesting === s.id ? 'Testing…' : 'Test Connection'}
                  </button>
                  {result && <span className={`text-sm ${result.ok ? 'text-accent-green' : 'text-accent-red'}`}>{result.message}</span>}
                </div>
              </>
            )}
          </div>
        );
      })}

      {sources.length === 0 && !adding && !loading && (
        <p className="text-text-dim text-sm text-center py-4">No Immich albums configured</p>
      )}

      {adding && (
        <div className="bg-surface-lighter rounded-xl p-4 space-y-3">
          <div>
            <label className="block text-sm text-text-dim mb-1">Name</label>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Family, Wife's Album" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm text-text-dim mb-1">Immich URL</label>
            <input type="url" value={newUrl} onChange={(e) => { setNewUrl(e.target.value); setAddTestResult(null); }} placeholder="https://immich.example.com" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm text-text-dim mb-1">API Key</label>
            <input type="password" value={newApiKey} onChange={(e) => { setNewApiKey(e.target.value); setAddTestResult(null); }} placeholder="From Immich > Account Settings > API Keys" autoComplete="off" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm text-text-dim mb-1">Album ID</label>
            <input type="text" value={newAlbumId} onChange={(e) => { setNewAlbumId(e.target.value); setAddTestResult(null); }} placeholder="UUID from Immich album URL" className={inputClass} />
            <p className="text-text-dim text-xs mt-1">Open the album in Immich — the ID is in the URL: …/albums/&lt;this-id&gt;</p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <button
              onClick={testNew}
              disabled={addTesting || !newUrl}
              className="bg-surface text-text-bright px-4 py-2 rounded-xl font-medium min-h-[44px] active:scale-95 transition-transform disabled:opacity-50"
            >
              {addTesting ? 'Testing…' : 'Test Connection'}
            </button>
            {addTestResult && <span className={`text-sm ${addTestResult.ok ? 'text-accent-green' : 'text-accent-red'}`}>{addTestResult.message}</span>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={saveNew}
              disabled={saving || !newUrl}
              className="flex-1 bg-accent-green text-bg font-bold py-3 rounded-xl min-h-[48px] active:scale-95 transition-transform disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Album'}
            </button>
            <button onClick={resetAddForm} className="px-4 py-3 rounded-xl text-text-dim font-medium">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
