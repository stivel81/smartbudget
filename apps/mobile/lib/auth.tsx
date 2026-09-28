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
  logout: async () => {},
});

/** The current auth context value. */
export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}
