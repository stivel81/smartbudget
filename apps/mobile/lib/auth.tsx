// Auth context shared by App.tsx (which owns the state and renders the
// provider) and every screen that needs the session. Lives here rather than
// in App.tsx so screens don't import App.tsx — that made a require cycle
// (App.tsx -> screens/*.tsx -> App.tsx) that Metro warns about.
import React, { useContext } from 'react';
import { SessionPayload, sessionExpiresAtMs } from './session';

export type { SessionPayload } from './session';

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
  /** When the access token expires (epoch ms, device clock); null when unknown/signed out. */
  expiresAt: number | null;
  setExpiresAt: (expiresAt: number | null) => void;
  /** One-off message for the Login screen, e.g. "Your session expired…"; cleared on sign-in. */
  sessionNotice: string | null;
  setSessionNotice: (notice: string | null) => void;
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
  expiresAt: null,
  setExpiresAt: () => {},
  sessionNotice: null,
  setSessionNotice: () => {},
  logout: async () => {},
});

/** The current auth context value. */
export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}

/**
 * Signed in or not. The refresh token is the session: the access token is
 * null while a launch restore's first renewal is still pending (offline,
 * 429, 5xx), and lib/api renews it before any authenticated call.
 */
export function isSignedIn(auth: Pick<AuthContextType, 'refreshToken'>): boolean {
  return auth.refreshToken !== null;
}

/**
 * Sign in with a session from the backend. Flipping isAuthenticated makes
 * App.tsx swap the auth stack for Main — callers must not navigate manually
 * (Main isn't registered until that re-render).
 */
export function applySession(auth: AuthContextType, session: SessionPayload): void {
  auth.setAccessToken(session.access_token);
  auth.setRefreshToken(session.refresh_token);
  auth.setExpiresAt(sessionExpiresAtMs(session));
  auth.setUserEmail(session.user.email);
  auth.setUserName(session.user.name ?? null);
  auth.setSessionNotice(null);
  auth.setIsAuthenticated(true);
}
