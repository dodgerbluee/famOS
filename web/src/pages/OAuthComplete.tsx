import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth, type AuthUser } from '../contexts/AuthContext';

export function OAuthComplete() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { setUser } = useAuth();

  const linkRequired = params.get('linkRequired') === 'true';
  const linkToken = params.get('linkToken') || '';
  const targetUsername = params.get('username') || '';
  const errorParam = params.get('error');

  const [status, setStatus] = useState<'processing' | 'link' | 'error'>('processing');
  const [errorMsg, setErrorMsg] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [linkError, setLinkError] = useState('');

  useEffect(() => {
    if (errorParam) {
      setErrorMsg(errorParam);
      setStatus('error');
      return;
    }
    if (linkRequired) {
      setStatus('link');
      return;
    }

    api.get<AuthUser>('/api/auth/me')
      .then((user) => {
        setUser(user);
        navigate('/', { replace: true });
      })
      .catch(() => {
        setErrorMsg('Sign-in did not complete. Your session may have expired — please try again.');
        setStatus('error');
      });
  }, [errorParam, linkRequired, navigate, setUser]);

  const handleLinkSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!linkPassword) {
      setLinkError('Password is required');
      return;
    }
    setLinkSubmitting(true);
    setLinkError('');
    try {
      const user = await api.post<AuthUser>('/api/auth/oauth/link', {
        linkToken,
        password: linkPassword,
      });
      const me = await api.get<AuthUser>('/api/auth/me').catch(() => user);
      setUser(me);
      navigate('/', { replace: true });
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Linking failed. Please try again.');
    } finally {
      setLinkSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {status === 'processing' && (
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <h1 className="text-2xl font-bold text-text-bright">Signing you in…</h1>
            <p className="text-text-dim">One moment while we finish setting up your session.</p>
          </div>
        )}

        {status === 'error' && (
          <>
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold text-text-bright">Sign-in failed</h1>
              <p className="text-text-dim">{errorMsg}</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="w-full bg-primary text-bg font-bold py-3 rounded-xl min-h-[48px]"
            >
              Back to sign in
            </button>
          </>
        )}

        {status === 'link' && (
          <>
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold text-text-bright">Link your account</h1>
              <p className="text-text-dim">
                An account already exists for <strong className="text-text-bright">{targetUsername}</strong>.
                Enter your password to link it to your SSO identity.
              </p>
            </div>
            {linkError && <p className="text-accent-red text-sm">{linkError}</p>}
            <form onSubmit={handleLinkSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-text-dim mb-1">Password</label>
                <input
                  type="password"
                  value={linkPassword}
                  onChange={(e) => setLinkPassword(e.target.value)}
                  required
                  autoFocus
                  autoComplete="current-password"
                  className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <button
                type="submit"
                disabled={linkSubmitting}
                className="w-full bg-primary text-bg font-bold py-3 rounded-xl min-h-[48px] disabled:opacity-50"
              >
                {linkSubmitting ? 'Linking…' : 'Link account'}
              </button>
              <button
                type="button"
                disabled={linkSubmitting}
                onClick={() => navigate('/login', { replace: true })}
                className="w-full bg-surface-lighter text-text-bright font-medium py-3 rounded-xl min-h-[48px]"
              >
                Cancel
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
