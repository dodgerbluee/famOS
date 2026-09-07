import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, type OAuthProvidersResponse } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

const BASE_URL = import.meta.env.VITE_API_URL || '';

export function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextRaw = searchParams.get('next') || '/';
  const next = nextRaw.startsWith('/') ? nextRaw : '/';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [providers, setProviders] = useState<OAuthProvidersResponse>({
    providers: [],
    allowLocalLogin: true,
  });

  useEffect(() => {
    api.get<OAuthProvidersResponse>('/api/auth/oauth/providers')
      .then(setProviders)
      .catch(() => {});
  }, []);

  if (user) {
    navigate(next, { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username, password);
      navigate(next, { replace: true });
    } catch {
      setError('Invalid username or password');
    } finally {
      setSubmitting(false);
    }
  };

  const showPasswordForm = providers.allowLocalLogin || providers.providers.length === 0;

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-text-bright">SandersHome</h1>
          <p className="text-text-dim mt-2">Sign in to continue</p>
        </div>

        {providers.providers.length > 0 && (
          <div className="space-y-3">
            {providers.providers.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  window.location.href = `${BASE_URL}/api/auth/oauth/login?provider=${encodeURIComponent(p.name)}`;
                }}
                className="w-full bg-surface-lighter text-text-bright font-medium py-3 rounded-xl min-h-[48px] active:scale-95 transition-transform"
              >
                Sign in with {p.displayName}
              </button>
            ))}
            {showPasswordForm && (
              <div className="flex items-center gap-3 text-text-dim text-sm">
                <span className="flex-1 border-t border-surface-lighter" />
                or
                <span className="flex-1 border-t border-surface-lighter" />
              </div>
            )}
          </div>
        )}

        {showPasswordForm && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-text-dim mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                autoComplete="username"
                className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm text-text-dim mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {error && <p className="text-accent-red text-sm">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary text-bg font-bold py-3 rounded-xl min-h-[48px] active:scale-95 transition-transform disabled:opacity-50"
            >
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-text-dim">
          Setting up a wall tablet?{' '}
          <Link to="/kiosk/setup" className="text-primary underline">Use as kiosk</Link>
        </p>
      </div>
    </div>
  );
}
