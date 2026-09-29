// Session manager: keeps the access token valid while the app runs.
//
// Supabase access tokens live ~1h; the refresh token is single-use (every
// refresh rotates it). This module owns "the current tokens" for API calls
// and renews them:
//   - proactively, shortly before expiry (a timer), and when the app comes
//     back to the foreground with a token that is due (timers don't run
//     while iOS suspends the app);
//   - reactively, when the backend answers 401 (lib/api.ts asks via
//     refreshAfterUnauthorized, then retries the request once).
// All renewals are single-flight: concurrent callers share one in-flight
// refresh, so a consumed refresh token is never sent twice.
//
// It is plain TypeScript with its collaborators injected (the refresh call,
// and callbacks into App's React state), so it has no imports from
// lib/api.ts or lib/auth.tsx — no require cycles, and unit-testable
// without React.

/** The session every sign-in endpoint returns (login, refresh, reset-password, verify-signup). */
export interface SessionPayload {
  access_token: string;
  refresh_token: string;
  /** Access-token expiry, unix seconds (null/absent from an older backend). */
  expires_at?: number | null;
  /** Access-token lifetime in seconds, as of the response (null/absent from an older backend). */
  expires_in?: number | null;
  user: { email: string; name?: string | null };
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  /** When the access token expires, epoch ms on this device's clock; null when unknown. */
  expiresAt: number | null;
}

/** Renew this long before the access token expires. */
export const REFRESH_LEEWAY_MS = 60_000;
/** Never schedule a timer refresh sooner than this (guards against refresh loops with odd expiries). */
export const MIN_REFRESH_DELAY_MS = 10_000;
/** After a transient refresh failure (offline, 429, 5xx) the timer retries after this, doubling per failure... */
export const RETRY_BASE_DELAY_MS = 30_000;
/** ...up to this. */
export const RETRY_MAX_DELAY_MS = 5 * 60_000;

/** Timer delay before retry number `failures` (1-based) after transient refresh failures. */
export function retryDelayMs(failures: number): number {
  return Math.min(RETRY_BASE_DELAY_MS * 2 ** Math.max(failures - 1, 0), RETRY_MAX_DELAY_MS);
}

const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * Expiry of a session's access token in epoch ms on this device. Prefers
 * expires_in (relative, so immune to the phone's clock disagreeing with the
 * server's), else expires_at; null when the backend sent neither.
 */
export function sessionExpiresAtMs(session: SessionPayload, nowMs: number = Date.now()): number | null {
  if (positive(session.expires_in)) return nowMs + session.expires_in * 1000;
  if (positive(session.expires_at)) return session.expires_at * 1000;
  return null;
}

/**
 * When to renew a token expiring at `expiresAt`: REFRESH_LEEWAY_MS early,
 * but never earlier than half its remaining life (so a short-lived token
 * isn't renewed on every call). Null when the expiry is unknown.
 */
export function refreshDueAt(expiresAt: number | null, nowMs: number, leewayMs: number = REFRESH_LEEWAY_MS): number | null {
  if (expiresAt === null) return null;
  const remaining = expiresAt - nowMs;
  return expiresAt - Math.min(leewayMs, Math.max(remaining / 2, 0));
}

/**
 * True when a failed refresh means the session is over (the backend
 * rejected the refresh token: 401, or 400 for a missing one). Anything else
 * — network failure, 429, 5xx — is transient: keep the session.
 */
export function isDeadSessionError(err: unknown): boolean {
  const code = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined;
  return code === 401 || code === 400;
}

export interface SessionManagerOptions {
  /** Exchange a refresh token for a new session (POST /auth/refresh). Rejects with ApiError on failure. */
  refresh: (refreshToken: string) => Promise<SessionPayload>;
  /** A renewal succeeded: store the new tokens (App state -> the rotated refresh token is persisted). */
  onRefreshed: (session: SessionPayload, expiresAt: number | null) => void;
  /** The refresh token was rejected: the session is over (App signs out and tells the user). */
  onExpired: () => void;
  now?: () => number;
  leewayMs?: number;
}

export interface SessionManager {
  /** Track these tokens (after sign-in / restore / a React state change), or none (sign-out). */
  setSession(tokens: SessionTokens | null): void;
  /** The current session's tokens, or null when signed out. */
  getSession(): SessionTokens | null;
  /** A usable access token: renewed first when it is due. Null when signed out or the session died. */
  getAccessToken(): Promise<string | null>;
  /**
   * `rejectedToken` got a 401. Renew (single-flight) unless the session has
   * already moved on to a newer token. Resolves the token to retry with, or
   * null when there is none (signed out, or the session died: onExpired has
   * fired). Rejects with the refresh error when renewal failed transiently
   * (offline, 429, 5xx) — the session is kept and renewal retried later, so
   * the caller gets a retryable error rather than a sign-out.
   */
  refreshAfterUnauthorized(rejectedToken: string): Promise<string | null>;
  /** Wire to AppState 'change': on 'active', renew a due token. */
  handleAppStateChange(state: string): void;
  /** Stop timers and forget the session (App unmount). A later setSession starts over (React StrictMode re-runs effects). */
  dispose(): void;
}

export function createSessionManager(options: SessionManagerOptions): SessionManager {
  const now = options.now ?? (() => Date.now());
  const leewayMs = options.leewayMs ?? REFRESH_LEEWAY_MS;

  let current: (SessionTokens & { dueAt: number | null }) | null = null;
  // Bumped whenever the session is replaced or cleared, so a refresh that
  // started for an older session can't write its result over a newer one
  // (or resurrect a signed-out one).
  let generation = 0;
  let inFlight: Promise<string | null> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Consecutive transient refresh failures, for the retry backoff.
  let failures = 0;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const isDue = () => current !== null && current.dueAt !== null && now() >= current.dueAt;

  const armTimer = (delay: number) => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      refreshNow().catch(() => {}); // transient failure: already re-armed with backoff
    }, delay);
  };

  const schedule = () => {
    clearTimer();
    if (!current || current.dueAt === null) return;
    armTimer(Math.max(current.dueAt - now(), MIN_REFRESH_DELAY_MS));
  };

  const track = (tokens: SessionTokens) => {
    current = { ...tokens, dueAt: refreshDueAt(tokens.expiresAt, now(), leewayMs) };
    schedule();
  };

  const forget = () => {
    current = null;
    generation += 1;
    inFlight = null;
    failures = 0;
    clearTimer();
  };

  async function runRefresh(gen: number, refreshToken: string): Promise<string | null> {
    try {
      const session = await options.refresh(refreshToken);
      if (gen !== generation) return current?.accessToken ?? null;
      const expiresAt = sessionExpiresAtMs(session, now());
      failures = 0;
      track({ accessToken: session.access_token, refreshToken: session.refresh_token, expiresAt });
      options.onRefreshed(session, expiresAt);
      return session.access_token;
    } catch (err) {
      if (gen !== generation) return current?.accessToken ?? null;
      if (isDeadSessionError(err)) {
        forget();
        options.onExpired();
        return null;
      }
      // Transient failure (offline, 429 rate limit, 5xx): never a sign-out.
      // Keep the session, retry on a backoff timer (30s, 1m, 2m… max 5m, so
      // a rate-limited backend isn't hammered), and hand the error to
      // whoever is waiting so they can show something retryable.
      failures += 1;
      armTimer(retryDelayMs(failures));
      throw err;
    }
  }

  function refreshNow(): Promise<string | null> {
    if (inFlight) return inFlight;
    if (!current) return Promise.resolve(null);
    clearTimer();
    const flight = runRefresh(generation, current.refreshToken);
    inFlight = flight;
    // Registered before any caller's await, so it runs first: by the time
    // callers resume, a new refresh can start.
    const settle = () => {
      if (inFlight === flight) inFlight = null;
    };
    flight.then(settle, settle);
    return flight;
  }

  return {
    setSession(tokens) {
      if (!tokens) {
        if (current) forget();
        return;
      }
      if (
        current &&
        current.accessToken === tokens.accessToken &&
        current.refreshToken === tokens.refreshToken &&
        current.expiresAt === tokens.expiresAt
      ) {
        return; // Already tracking these (e.g. App echoing back our own refresh).
      }
      generation += 1;
      inFlight = null;
      failures = 0;
      track(tokens);
    },

    getSession() {
      if (!current) return null;
      return { accessToken: current.accessToken, refreshToken: current.refreshToken, expiresAt: current.expiresAt };
    },

    async getAccessToken() {
      if (!current) return null;
      if (isDue()) {
        try {
          return await refreshNow();
        } catch {
          // Transient failure: fall back to the current token and let the
          // backend decide (it may still be valid for up to a minute).
          return current?.accessToken ?? null;
        }
      }
      return current.accessToken;
    },

    refreshAfterUnauthorized(rejectedToken) {
      if (!current) return Promise.resolve(null);
      if (current.accessToken !== rejectedToken) return Promise.resolve(current.accessToken);
      return refreshNow();
    },

    handleAppStateChange(state) {
      if (state === 'active' && isDue()) refreshNow().catch(() => {});
    },

    dispose() {
      forget();
    },
  };
}
