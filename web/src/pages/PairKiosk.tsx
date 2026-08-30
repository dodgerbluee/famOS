import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import type { AuthUser } from '../contexts/AuthContext';

export function PairKiosk() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { setUser, user, loading } = useAuth();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Signing this device in...');
  const [confirmed, setConfirmed] = useState(false);

  const needsConfirm = !loading && !!user && user.role !== 'kiosk';

  useEffect(() => {
    if (!token || loading || (needsConfirm && !confirmed)) return;
    let cancelled = false;
    api.post<{ name: string }>('/api/kiosks/claim', { token })
      .then(async () => {
        if (cancelled) return;
        const me = await api.get<AuthUser>('/api/auth/me');
        setUser(me);
        setStatus('Signed in. Opening dashboard...');
        navigate('/', { replace: true });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Pairing failed.');
      });
    return () => { cancelled = true; };
  }, [token, navigate, setUser, loading, needsConfirm, confirmed]);

  if (needsConfirm && !confirmed && !error) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <h1 className="text-2xl font-bold text-text-bright">Use this device as a kiosk?</h1>
          <p className="text-text-dim">You are signed in as {user.name}. Pairing will turn this device into a shared kiosk until an adult logs it out in Settings.</p>
          <button onClick={() => setConfirmed(true)} className="w-full bg-primary text-white font-bold py-3 rounded-xl min-h-[48px]">Pair this device</button>
          <button onClick={() => navigate('/')} className="text-text-dim text-sm">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center space-y-4">
        <h1 className="text-2xl font-bold text-text-bright">Kiosk pairing</h1>
        {error ? (
          <>
            <p className="text-accent-red">{error}</p>
            <button onClick={() => navigate('/kiosk/setup')} className="text-primary underline">Set up as kiosk instead</button>
          </>
        ) : (
          <p className="text-text-dim">{status}</p>
        )}
      </div>
    </div>
  );
}
