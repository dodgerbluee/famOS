import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface AIProvider {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  model: string;
  active: boolean;
}

interface TestResult {
  ok: boolean;
  error?: string;
  models?: string[];
}

export function AIProviderSettings() {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [selectedModel, setSelectedModel] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editModels, setEditModels] = useState<string[]>([]);
  const [editLoading, setEditLoading] = useState(false);

  const load = () => {
    api.get<AIProvider[]>('/api/ai/providers').then(setProviders).catch(() => {});
  };

  useEffect(load, []);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post<TestResult>('/api/ai/providers/test', {
        url: newUrl,
        apiKey: newApiKey,
      });
      setTestResult(res);
      if (res.ok && res.models && res.models.length > 0) {
        setSelectedModel(res.models[0]);
      }
    } catch (e) {
      setTestResult({ ok: false, error: e instanceof Error ? e.message : 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  const saveProvider = async () => {
    setSaving(true);
    try {
      const { id } = await api.post<{ id: string }>('/api/ai/providers', {
        name: newName || 'AI Provider',
        url: newUrl,
        apiKey: newApiKey,
      });
      const active = true;
      await api.put(`/api/ai/providers/${id}`, { model: selectedModel, active });
      resetForm();
      load();
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setAdding(false);
    setNewName('');
    setNewUrl('');
    setNewApiKey('');
    setTestResult(null);
    setSelectedModel('');
  };

  const toggleActive = async (id: string, active: boolean) => {
    await api.put(`/api/ai/providers/${id}`, { active });
    load();
  };

  const deleteProvider = async (id: string) => {
    await api.delete(`/api/ai/providers/${id}`);
    load();
  };

  const startEditModel = async (id: string) => {
    setEditingId(id);
    setEditLoading(true);
    try {
      const models = await api.get<string[]>(`/api/ai/providers/${id}/models`);
      setEditModels(models);
    } catch {
      setEditModels([]);
    } finally {
      setEditLoading(false);
    }
  };

  const saveModel = async (id: string, model: string) => {
    await api.put(`/api/ai/providers/${id}`, { model });
    setEditingId(null);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-primary-light uppercase tracking-wide">AI Provider</h3>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="bg-primary text-white text-sm px-4 py-2 rounded-xl font-medium active:scale-95 transition-transform"
          >
            + Add Provider
          </button>
        )}
      </div>

      {providers.map((p) => (
        <div key={p.id} className="bg-surface-lighter rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-bright font-medium">{p.name}</p>
              <p className="text-text-dim text-xs">{p.url}</p>
            </div>
            <div className="flex items-center gap-2">
              {p.active ? (
                <span className="text-accent-green text-xs font-medium bg-accent-green/10 px-2 py-1 rounded-lg">Active</span>
              ) : (
                <button
                  onClick={() => toggleActive(p.id, true)}
                  className="text-text-dim text-xs px-2 py-1 rounded-lg border border-surface-light hover:text-text-bright"
                >
                  Set Active
                </button>
              )}
              <button
                onClick={() => deleteProvider(p.id)}
                className="text-accent-red text-xs font-medium"
              >
                Remove
              </button>
            </div>
          </div>

          {editingId === p.id ? (
            <div className="flex gap-2 items-center">
              {editLoading ? (
                <span className="text-text-dim text-sm">Loading models...</span>
              ) : (
                <>
                  <select
                    value={p.model}
                    onChange={(e) => saveModel(p.id, e.target.value)}
                    className="flex-1 bg-surface text-text-bright rounded-lg px-3 py-2 text-sm outline-none"
                  >
                    {editModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <button onClick={() => setEditingId(null)} className="text-text-dim text-sm">
                    Cancel
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-text-dim text-sm">
                Model: <span className="text-text-bright">{p.model || 'not set'}</span>
              </p>
              <button
                onClick={() => startEditModel(p.id)}
                className="text-primary-light text-xs font-medium"
              >
                Change Model
              </button>
            </div>
          )}
        </div>
      ))}

      {providers.length === 0 && !adding && (
        <p className="text-text-dim text-sm text-center py-4">No AI providers configured</p>
      )}

      {adding && (
        <div className="bg-surface-lighter rounded-xl p-4 space-y-3">
          <div>
            <label className="block text-sm text-text-dim mb-1">Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Ollama, Open WebUI"
              className="w-full bg-surface text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm text-text-dim mb-1">URL</label>
            <input
              type="url"
              value={newUrl}
              onChange={(e) => { setNewUrl(e.target.value); setTestResult(null); }}
              placeholder="http://localhost:11434"
              className="w-full bg-surface text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm text-text-dim mb-1">API Key</label>
            <input
              type="password"
              value={newApiKey}
              onChange={(e) => { setNewApiKey(e.target.value); setTestResult(null); }}
              placeholder="Optional — leave blank if not required"
              autoComplete="off"
              className="w-full bg-surface text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <button
            onClick={testConnection}
            disabled={testing || !newUrl}
            className="bg-surface text-text-bright px-4 py-2 rounded-xl font-medium min-h-[48px] active:scale-95 transition-transform disabled:opacity-50"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>

          {testResult && !testResult.ok && (
            <p className="text-accent-red text-sm">{testResult.error}</p>
          )}

          {testResult?.ok && testResult.models && (
            <div className="space-y-2">
              <p className="text-accent-green text-sm">Connected — {testResult.models.length} model(s) available</p>
              <div>
                <label className="block text-sm text-text-dim mb-1">Model</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full bg-surface text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
                >
                  {testResult.models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={saveProvider}
                  disabled={saving || !selectedModel}
                  className="flex-1 bg-accent-green text-bg font-bold py-3 rounded-xl min-h-[48px] active:scale-95 transition-transform disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Provider'}
                </button>
                <button
                  onClick={resetForm}
                  className="px-4 py-3 rounded-xl text-text-dim font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!testResult && (
            <button onClick={resetForm} className="text-text-dim text-sm font-medium">
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
