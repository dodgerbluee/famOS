import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

interface Invite {
  id: string;
  token: string;
  role: string;
  expiresAt: string;
  createdAt: string;
  createdByName: string;
}

export function InvitesTab() {
  const { hasPermission } = useAuth();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [role, setRole] = useState<'parent' | 'kid'>('parent');
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<Invite[]>('/api/invites').then(setInvites).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setCreating(true);
    try {
      await api.post('/api/invites', { role });
      load();
    } catch { /* */ }
    setCreating(false);
  };

  const revoke = async (id: string) => {
    await api.delete(`/api/invites/${id}`);
    load();
  };

  const copyLink = (token: string) => {
    const link = `${window.location.origin}/join/${token}`;
    navigator.clipboard.writeText(link);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!hasPermission('invites.manage')) return null;

  return (
    <div className="bg-surface rounded-2xl p-5 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-text-bright mb-3">Create Invite Link</h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-sm text-text-dim mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'parent' | 'kid')}
              className="w-full bg-surface-lighter text-text-bright rounded-lg px-3 py-2 outline-none"
            >
              <option value="parent">Parent</option>
              <option value="kid">Kid</option>
            </select>
          </div>
          <button
            onClick={create}
            disabled={creating}
            className="bg-primary text-bg px-4 py-2 rounded-xl font-medium min-h-[44px] active:scale-95 transition-transform disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-text-bright mb-3">Active Invites</h3>
        {invites.length === 0 ? (
          <p className="text-text-dim text-sm">No active invite links</p>
        ) : (
          <div className="space-y-3">
            {invites.map((inv) => (
              <div key={inv.id} className="bg-surface-lighter rounded-xl p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-bright capitalize">{inv.role}</span>
                    <span className="text-xs text-text-dim">by {inv.createdByName}</span>
                  </div>
                  <p className="text-xs text-text-dim mt-1">
                    Expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => copyLink(inv.token)}
                    className="text-xs bg-surface text-primary px-3 py-1.5 rounded-lg font-medium min-h-[36px]"
                  >
                    {copied === inv.token ? 'Copied!' : 'Copy Link'}
                  </button>
                  <button
                    onClick={() => revoke(inv.id)}
                    className="text-xs bg-surface text-accent-red px-3 py-1.5 rounded-lg font-medium min-h-[36px]"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
