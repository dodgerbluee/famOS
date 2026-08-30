import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import type { AuthUser } from '../contexts/AuthContext';
import { PairingQr } from '../components/kiosk/PairingQr';

export function SetupKiosk() {
  const navigate = useNavigate();
  const { setUser, user, loading } = useAuth();
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  useEffect(() => {
    if (loading) return;
    if (user) {
      navigate('/', { replace: true });
      return;
    }

    let pollSecret = '';
    let pairingToken = '';
    let cancelled = false;
    let timer: number | undefined;

    const claim = async (claimToken: string) => {
      await api.post('/api/kiosks/claim', { claimToken });
      const me = await api.get<AuthUser>('/api/auth/me');
      setUser(me);
      navigate('/', { replace: true });
    };

    const poll = async () => {
      if (cancelled || !pairingToken || !pollSecret) return;
      try {
        const result = await api.get<{ status: string; claimToken?: string }>(
          `/api/kiosks/pending/${pairingToken}?secret=${encodeURIComponent(pollSecret)}`,
        );
        if (result.status === 'approved' && result.claimToken) {
          await claim(result.claimToken);
          return;
        }
        if (result.status === 'expired') {
          setError('This pairing code expired. Refresh to try again.');
          return;
        }
      } catch {
        /* keep polling */
      }
      timer = window.setTimeout(poll, 2000);
    };

    api.post<{ token: string; pollSecret: string; expiresAt: string }>('/api/kiosks/pending', {})
      .then((pending) => {
        if (cancelled) return;
        pairingToken = pending.token;
        pollSecret = pending.pollSecret;
        setToken(pending.token);
        setExpiresAt(pending.expiresAt);
        poll();
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not start kiosk setup.');
      });

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [navigate, setUser, user, loading]);

  const approveUrl = token ? `${window.location.origin}/kiosk/approve/${token}` : '';

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-bold text-text-bright">Set up this kiosk</h1>
          <p className="text-text-dim mt-2">Scan with a signed-in adult phone. This device stays signed in until an adult logs it out in Settings.</p>
        </div>

        {error && <p className="text-accent-red text-sm">{error}</p>}

        {token && !error && (
          <>
            <PairingQr value={approveUrl} />
            <p className="text-text-dim text-sm">Waiting for an adult to approve...</p>
            {expiresAt && (
              <p className="text-text-dim text-xs">Expires {new Date(expiresAt).toLocaleTimeString()}</p>
            )}
          </>
        )}

        {!token && !error && <p className="text-text-dim">Preparing pairing code...</p>}

        <button onClick={() => navigate('/login')} className="text-primary text-sm underline">Back to sign in</button>
      </div>
    </div>
  );
}
