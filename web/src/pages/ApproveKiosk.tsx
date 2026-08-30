import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export function ApproveKiosk() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, loading, hasPermission } = useAuth();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate(`/login?next=/kiosk/approve/${token}`, { replace: true });
    }
  }, [loading, user, navigate, token]);

  const approve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError('');
    setSubmitting(true);
    try {
      await api.post('/api/kiosks/approve', { token, name: name.trim() });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not approve this kiosk.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasPermission('family.manage')) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <p className="text-text-dim text-center">Only an adult can approve a kiosk.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-bright">Approve kiosk</h1>
          <p className="text-text-dim mt-2">This will sign in the device showing the QR code.</p>
        </div>

        {done ? (
          <div className="space-y-4 text-center">
            <p className="text-accent-green font-medium">{name} is approved. The kiosk should open the dashboard shortly.</p>
            <Link to="/settings" className="text-primary underline">Manage kiosks in Settings</Link>
          </div>
        ) : (
          <form onSubmit={approve} className="space-y-4">
            <div>
              <label className="block text-sm text-text-dim mb-1">Kiosk name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Kitchen tablet"
                required
                autoFocus
                className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            {error && <p className="text-accent-red text-sm">{error}</p>}
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="w-full bg-primary text-white font-bold py-3 rounded-xl min-h-[48px] disabled:opacity-50"
            >
              {submitting ? 'Approving...' : 'Approve and sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
