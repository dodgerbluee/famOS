import { useCallback, useEffect, useState } from 'react';
import { api, type Kiosk } from '../../api/client';
import { PairingQr } from '../kiosk/PairingQr';

function pairingUrl(token: string) {
  return `${window.location.origin}/kiosk/pair/${token}`;
}

function formatSeen(value?: string) {
  if (!value) return 'Never';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Never';
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleString();
}

export function KiosksTab() {
  const [kiosks, setKiosks] = useState<Kiosk[]>([]);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [activePairing, setActivePairing] = useState<{ name: string; token: string; expiresAt?: string } | null>(null);

  const load = useCallback(() => {
    api.get<Kiosk[]>('/api/kiosks').then(setKiosks).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const created = await api.post<Kiosk>('/api/kiosks', { name: name.trim() });
      setName('');
      if (created.pairingToken) {
        setActivePairing({ name: created.name, token: created.pairingToken, expiresAt: created.expiresAt });
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create kiosk');
    } finally {
      setCreating(false);
    }
  };

  const showQr = async (kiosk: Kiosk) => {
    try {
      const pairing = await api.post<{ pairingToken: string; expiresAt: string; name: string }>(`/api/kiosks/${kiosk.id}/pairing`, {});
      setActivePairing({ name: pairing.name || kiosk.name, token: pairing.pairingToken, expiresAt: pairing.expiresAt });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create pairing');
    }
  };

  const logout = async (id: string) => {
    await api.post(`/api/kiosks/${id}/logout`, {});
    load();
  };

  const remove = async (id: string) => {
    await api.delete(`/api/kiosks/${id}`);
    if (activePairing) setActivePairing(null);
    load();
  };

  return (
    <div className="bg-surface rounded-2xl p-5 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-bright">Kiosks</h2>
        <p className="text-text-dim text-sm mt-1">
          Shared screens stay signed in across restarts. Scan the QR on the kiosk device, or open the pairing link there.
        </p>
      </div>

      <form onSubmit={create} className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Kitchen tablet"
          className="flex-1 bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          required
        />
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="bg-primary text-white px-4 py-3 rounded-xl font-medium min-h-[48px] active:scale-95 transition-transform disabled:opacity-50"
        >
          {creating ? 'Adding...' : 'Add Kiosk'}
        </button>
      </form>

      {error && <p className="text-accent-red text-sm">{error}</p>}

      {activePairing && (
        <div className="bg-surface-light rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-text-bright font-semibold">Pair {activePairing.name}</h3>
              <p className="text-text-dim text-sm mt-1">Open this on the kiosk. The code expires in 15 minutes.</p>
            </div>
            <button onClick={() => setActivePairing(null)} className="text-text-dim text-2xl leading-none min-w-[44px] min-h-[44px]">×</button>
          </div>
          <PairingQr value={pairingUrl(activePairing.token)} />
          <p className="text-xs text-text-dim break-all text-center">{pairingUrl(activePairing.token)}</p>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(pairingUrl(activePairing.token))}
            className="w-full bg-surface-lighter text-primary font-medium py-3 rounded-xl min-h-[48px]"
          >
            Copy pairing link
          </button>
        </div>
      )}

      <div className="space-y-2">
        {kiosks.map((k) => (
          <div key={k.id} className="bg-surface-light rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-text-bright font-medium">{k.name}</p>
                <p className="text-text-dim text-sm">
                  {k.paired ? `Signed in · Last seen ${formatSeen(k.lastSeenAt)}` : 'Not signed in'}
                </p>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-lg ${k.paired ? 'bg-accent-green/20 text-accent-green' : 'bg-surface-lighter text-text-dim'}`}>
                {k.paired ? 'Active' : 'Waiting'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => showQr(k)} className="text-primary text-sm px-3 py-2 min-h-[44px]">Show QR</button>
              {k.paired && (
                <button onClick={() => logout(k.id)} className="text-text-dim text-sm px-3 py-2 min-h-[44px]">Log out</button>
              )}
              <button onClick={() => remove(k.id)} className="text-accent-red text-sm px-3 py-2 min-h-[44px]">Remove</button>
            </div>
          </div>
        ))}
        {kiosks.length === 0 && (
          <p className="text-text-dim text-center py-4">No kiosks yet. Add one, then scan the QR from the tablet.</p>
        )}
      </div>
    </div>
  );
}
