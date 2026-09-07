import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type OAuthProviderConfig } from '../../api/client';

const inputClass = 'w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary disabled:opacity-50';

export function SsoTab() {
  const [providers, setProviders] = useState<OAuthProviderConfig[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<OAuthProviderConfig | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api.get<OAuthProviderConfig[]>('/api/admin/oauth-providers')
      .then(setProviders)
      .catch(() => setError('Failed to load SSO providers'));
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (provider: OAuthProviderConfig) => {
    if (!window.confirm(`Delete SSO provider "${provider.name}"?`)) return;
    setError('');
    try {
      await api.delete(`/api/admin/oauth-providers/${provider.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete provider');
    }
  };

  return (
    <div className="bg-surface rounded-2xl p-5 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-bright">SSO providers</h2>
          <p className="text-text-dim text-sm mt-1">
            Configure OpenID Connect providers (Authentik, Keycloak, Okta, etc.). You can also set
            OAUTH_* environment variables as a fallback.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="bg-primary text-bg font-bold px-4 py-2 rounded-xl min-h-[44px] whitespace-nowrap"
        >
          Add provider
        </button>
      </div>

      {error && <p className="text-accent-red text-sm">{error}</p>}

      {providers.length === 0 ? (
        <p className="text-text-dim text-sm">
          No SSO providers configured. Add one to allow household members to sign in via OpenID Connect.
        </p>
      ) : (
        <div className="space-y-3">
          {providers.map((p) => (
            <div key={p.id} className="bg-surface-lighter rounded-xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-text-bright font-semibold">{p.displayName}</h3>
                  <span className="text-text-dim text-sm">{p.name}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.enabled ? 'bg-primary/20 text-primary' : 'bg-black/30 text-text-dim'}`}>
                    {p.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditing(p)} className="bg-surface text-text-bright px-3 py-2 rounded-xl min-h-[44px]">
                    Edit
                  </button>
                  <button type="button" onClick={() => remove(p)} className="bg-surface text-accent-red px-3 py-2 rounded-xl min-h-[44px]">
                    Delete
                  </button>
                </div>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-text-dim">Type</dt>
                <dd className="text-text-bright">{p.providerType}</dd>
                <dt className="text-text-dim">Issuer</dt>
                <dd className="text-text-bright break-all">{p.issuerUrl}</dd>
                <dt className="text-text-dim">Client ID</dt>
                <dd className="text-text-bright break-all">{p.clientId}</dd>
                <dt className="text-text-dim">Scopes</dt>
                <dd className="text-text-bright">{p.scopes}</dd>
                <dt className="text-text-dim">Auto-register</dt>
                <dd className="text-text-bright">{p.autoRegister ? 'Yes' : 'No'}</dd>
              </dl>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <ProviderModal
          provider={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function ProviderModal({
  provider,
  onClose,
  onSaved,
}: {
  provider: OAuthProviderConfig | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!provider;
  const [name, setName] = useState(provider?.name ?? '');
  const [displayName, setDisplayName] = useState(provider?.displayName ?? '');
  const [providerType, setProviderType] = useState<'authentik' | 'generic_oidc'>(provider?.providerType ?? 'authentik');
  const [clientId, setClientId] = useState(provider?.clientId ?? '');
  const [clientSecret, setClientSecret] = useState('');
  const [issuerUrl, setIssuerUrl] = useState(provider?.issuerUrl ?? '');
  const [scopes, setScopes] = useState(provider?.scopes ?? 'openid,profile,email');
  const [autoRegister, setAutoRegister] = useState(provider?.autoRegister ?? true);
  const [enabled, setEnabled] = useState(provider?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (isEdit && provider) {
        await api.put(`/api/admin/oauth-providers/${provider.id}`, {
          displayName,
          providerType,
          clientId,
          clientSecret: clientSecret || undefined,
          issuerUrl,
          scopes,
          autoRegister,
          enabled,
        });
      } else {
        await api.post('/api/admin/oauth-providers', {
          name: name.trim(),
          displayName,
          providerType,
          clientId,
          clientSecret,
          issuerUrl,
          scopes,
          autoRegister,
          enabled,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save provider');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-surface rounded-2xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-bright">
            {isEdit ? `Edit provider: ${provider?.name}` : 'Add SSO provider'}
          </h3>
          <button type="button" onClick={onClose} className="text-text-dim text-2xl leading-none min-w-[44px] min-h-[44px]">×</button>
        </div>

        {error && <p className="text-accent-red text-sm">{error}</p>}

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-text-dim mb-1">Identifier</label>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required disabled={isEdit || saving} placeholder="e.g. authentik" autoComplete="off" />
          </div>
          <div>
            <label className="block text-sm text-text-dim mb-1">Display name</label>
            <input className={inputClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required disabled={saving} placeholder="e.g. Company SSO" autoComplete="off" />
          </div>
        </div>

        <div>
          <label className="block text-sm text-text-dim mb-1">Provider type</label>
          <select className={inputClass} value={providerType} onChange={(e) => setProviderType(e.target.value as 'authentik' | 'generic_oidc')} disabled={saving}>
            <option value="authentik">Authentik</option>
            <option value="generic_oidc">Generic OIDC</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-text-dim mb-1">Issuer URL</label>
          <input className={inputClass} value={issuerUrl} onChange={(e) => setIssuerUrl(e.target.value)} required disabled={saving} placeholder="https://auth.example.com/application/o/famos/" autoComplete="off" />
        </div>

        <div>
          <label className="block text-sm text-text-dim mb-1">Client ID</label>
          <input className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)} required disabled={saving} autoComplete="off" />
        </div>

        <div>
          <label className="block text-sm text-text-dim mb-1">
            {isEdit ? 'Client secret (leave blank to keep current)' : 'Client secret'}
          </label>
          <input className={inputClass} type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} required={!isEdit} disabled={saving} autoComplete="new-password" />
        </div>

        <div>
          <label className="block text-sm text-text-dim mb-1">Scopes (comma-separated)</label>
          <input className={inputClass} value={scopes} onChange={(e) => setScopes(e.target.value)} disabled={saving} autoComplete="off" />
        </div>

        <label className="flex items-center gap-3 text-text-bright min-h-[44px]">
          <input type="checkbox" checked={autoRegister} onChange={(e) => setAutoRegister(e.target.checked)} disabled={saving} />
          Auto-create household members on first sign-in
        </label>

        <label className="flex items-center gap-3 text-text-bright min-h-[44px]">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={saving} />
          Enabled
        </label>

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} disabled={saving} className="bg-surface-lighter text-text-bright px-4 py-2 rounded-xl min-h-[44px]">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="bg-primary text-bg font-bold px-4 py-2 rounded-xl min-h-[44px] disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create provider'}
          </button>
        </div>
      </form>
    </div>
  );
}
