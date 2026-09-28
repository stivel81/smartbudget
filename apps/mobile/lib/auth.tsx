// Auth context shared by App.tsx (which owns the state and renders the
// provider) and every screen that needs the session. Lives here rather than
// in App.tsx so screens don't import App.tsx — that made a require cycle
// (App.tsx -> screens/*.tsx -> App.tsx) that Metro warns about.
import React, { useContext } from 'react';

export interface AuthContextType {
  isAuthenticated: boolean;
  setIsAuthenticated: (value: boolean) => void;
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  refreshToken: string | null;
  setRefreshToken: (token: string | null) => void;
  userEmail: string | null;
  setUserEmail: (email: string | null) => void;
  /** Display name from signup ("Adrian Schtivelmager"); null when unknown. */
  userName: string | null;
  setUserName: (name: string | null) => void;
  logout: () => Promise<void>;
}

export const AuthContext = React.createContext<AuthContextType>({
  isAuthenticated: false,
  setIsAuthenticated: () => {},
  accessToken: null,
  setAccessToken: () => {},
  refreshToken: null,
  setRefreshToken: () => {},
  userEmail: null,
  setUserEmail: () => {},
  userName: null,
  setUserName: () => {},
  logout: async () => {},
});

/** The current auth context value. */
export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}

/** The session every sign-in endpoint returns (login, refresh, reset-password, verify-signup). */
export interface SessionPayload {
  access_token: string;
  refresh_token: string;
  user: { email: string; name?: string | null };
}

/**
 * Sign in with a session from the backend. Flipping isAuthenticated makes
 * App.tsx swap the auth stack for Main — callers must not navigate manually
 * (Main isn't registered until that re-render).
 */
export function applySession(auth: AuthContextType, session: SessionPayload): void {
  auth.setAccessToken(session.access_token);
  auth.setRefreshToken(session.refresh_token);
  auth.setUserEmail(session.user.email);
  auth.setUserName(session.user.name ?? null);
  auth.setIsAuthenticated(true);
}
