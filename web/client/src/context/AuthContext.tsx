import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '@/api/auth';
import { setUnauthorizedHandler } from '@/api/client';
import type { AuthMeResponse } from '@/types/api';

interface AuthContextValue {
  auth: AuthMeResponse | null;
  loading: boolean;
  refreshAuth: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthMeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshAuth = useCallback(async () => {
    try {
      const data = await authApi.me();
      setAuth(data);
    } catch {
      setAuth({
        authenticated: false,
        authorized: false,
        isOwner: false,
        user: null,
        bot: { id: null, username: 'BOT Gaben', avatarUrl: null, online: false },
        guild: null,
        oauthConfigured: true,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      await refreshAuth();
    }
  }, [refreshAuth]);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuth((prev) =>
        prev
          ? { ...prev, authenticated: false, authorized: false, user: null }
          : null,
      );
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const value = useMemo(
    () => ({ auth, loading, refreshAuth, logout }),
    [auth, loading, refreshAuth, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
