import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { api } from '../api/client';

export interface AuthUser {
  memberId: string;
  name: string;
  role: 'admin' | 'parent' | 'kid' | 'kiosk';
  familyId: string;
  color: string;
  username: string;
  sessionId?: string;
  sessionType?: 'user' | 'kiosk';
  permissions: Record<string, boolean>;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  needsSetup: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  hasPermission: (perm: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  const assignUser = useCallback((next: AuthUser | null) => {
    setUser(next);
    if (next) setNeedsSetup(false);
  }, []);

  useEffect(() => {
    api.get<AuthUser>('/api/auth/me')
      .then((u) => assignUser(u))
      .catch(() =>
        api.get<{ needsSetup: boolean }>('/api/setup/status')
          .then((s) => setNeedsSetup(s.needsSetup))
          .catch(() => {})
      )
      .finally(() => setLoading(false));
  }, [assignUser]);

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.post<AuthUser>('/api/auth/login', { username, password });
    const me = await api.get<AuthUser>('/api/auth/me');
    assignUser(me ?? result);
  }, [assignUser]);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout', {});
    setUser(null);
    try {
      const s = await api.get<{ needsSetup: boolean }>('/api/setup/status');
      setNeedsSetup(s.needsSetup);
    } catch {
      setNeedsSetup(false);
    }
  }, []);

  const hasPermission = useCallback((perm: string) => {
    if (!user) return false;
    return user.permissions?.[perm] ?? false;
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, needsSetup, login, logout, setUser: assignUser, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
