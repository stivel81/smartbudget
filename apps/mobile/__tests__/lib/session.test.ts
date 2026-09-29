import {
  createSessionManager,
  isDeadSessionError,
  MIN_REFRESH_DELAY_MS,
  REFRESH_LEEWAY_MS,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
  retryDelayMs,
  refreshDueAt,
  sessionExpiresAtMs,
  SessionPayload,
} from '../../lib/session';

const HOUR = 3_600_000;
const T0 = 1_790_000_000_000;

function payload(n: number, extra: Partial<SessionPayload> = {}): SessionPayload {
  return { access_token: `acc-${n}`, refresh_token: `ref-${n}`, expires_in: 3600, user: { email: 'a@b.com', name: 'Ada' }, ...extra };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let pending promise callbacks run (fake timers don't block microtasks). */
async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('lib/session helpers', () => {
  describe('sessionExpiresAtMs', () => {
    it('prefers expires_in (relative to now: immune to device clock skew)', () => {
      expect(sessionExpiresAtMs(payload(1, { expires_in: 3600, expires_at: 1 }), T0)).toBe(T0 + HOUR);
    });

    it('falls back to expires_at (unix seconds)', () => {
      expect(sessionExpiresAtMs(payload(1, { expires_in: null, expires_at: 1_790_003_600 }), T0)).toBe(1_790_003_600_000);
    });

    it.each([
      ['absent (older backend)', { expires_in: undefined, expires_at: undefined }],
      ['null', { expires_in: null, expires_at: null }],
      ['non-positive', { expires_in: 0, expires_at: -1 }],
      ['NaN', { expires_in: NaN, expires_at: NaN }],
    ])('is null when %s', (_label, extra) => {
      expect(sessionExpiresAtMs(payload(1, extra as Partial<SessionPayload>), T0)).toBeNull();
    });

    it('defaults to Date.now()', () => {
      jest.spyOn(Date, 'now').mockReturnValue(T0);
      expect(sessionExpiresAtMs(payload(1))).toBe(T0 + HOUR);
      (Date.now as jest.Mock).mockRestore();
    });
  });

  describe('refreshDueAt', () => {
    it('is REFRESH_LEEWAY_MS (60s) before expiry for a normal 1h token', () => {
      expect(REFRESH_LEEWAY_MS).toBe(60_000);
      expect(refreshDueAt(T0 + HOUR, T0)).toBe(T0 + HOUR - 60_000);
    });

    it('is at half the remaining life for a token shorter than 2x the leeway', () => {
      expect(refreshDueAt(T0 + 30_000, T0)).toBe(T0 + 15_000);
    });

    it('is the expiry itself for an already-expired token (due now)', () => {
      expect(refreshDueAt(T0 - 5_000, T0)).toBe(T0 - 5_000);
    });

    it('is null when the expiry is unknown', () => {
      expect(refreshDueAt(null, T0)).toBeNull();
    });

    it('honors a custom leeway', () => {
      expect(refreshDueAt(T0 + HOUR, T0, 5_000)).toBe(T0 + HOUR - 5_000);
    });
  });

  describe('isDeadSessionError', () => {
    it.each([
      [{ code: 401 }, true],
      [{ code: 400 }, true],
      [{ code: 429 }, false],
      [{ code: 500 }, false],
      [{ code: '401' }, false],
      [new TypeError('Network request failed'), false],
      [null, false],
      [undefined, false],
      ['401', false],
    ])('%p -> %p', (err, dead) => {
      expect(isDeadSessionError(err)).toBe(dead);
    });
  });
});

describe('createSessionManager', () => {
  let now: number;
  let refresh: jest.Mock<Promise<SessionPayload>, [string]>;
  let onRefreshed: jest.Mock;
  let onExpired: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    now = T0;
    refresh = jest.fn();
    onRefreshed = jest.fn();
    onExpired = jest.fn();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function make(options: { leewayMs?: number } = {}) {
    return createSessionManager({ refresh, onRefreshed, onExpired, now: () => now, ...options });
  }

  function started(expiresAt: number | null = T0 + HOUR) {
    const manager = make();
    manager.setSession({ accessToken: 'acc-0', refreshToken: 'ref-0', expiresAt });
    return manager;
  }

  /** Move the (injected) clock and the fake timers together. */
  async function advance(ms: number) {
    now += ms;
    jest.advanceTimersByTime(ms);
    await flush();
  }

  describe('tracking the session', () => {
    it('starts signed out', async () => {
      const manager = make();
      expect(manager.getSession()).toBeNull();
      await expect(manager.getAccessToken()).resolves.toBeNull();
      await expect(manager.refreshAfterUnauthorized('x')).resolves.toBeNull();
      expect(refresh).not.toHaveBeenCalled();
    });

    it('hands out the current token without refreshing while it is fresh', async () => {
      const manager = started();
      await expect(manager.getAccessToken()).resolves.toBe('acc-0');
      expect(manager.getSession()).toEqual({ accessToken: 'acc-0', refreshToken: 'ref-0', expiresAt: T0 + HOUR });
      expect(refresh).not.toHaveBeenCalled();
    });

    it('setSession(null) signs out', async () => {
      const manager = started();
      manager.setSession(null);
      expect(manager.getSession()).toBeNull();
      await expect(manager.getAccessToken()).resolves.toBeNull();
      manager.setSession(null); // idempotent
      expect(manager.getSession()).toBeNull();
    });

    it('ignores an echo of the tokens it already tracks (App syncing its state back) — an in-flight refresh still lands', async () => {
      const pending = deferred<SessionPayload>();
      refresh.mockReturnValueOnce(pending.promise);
      const manager = started();

      const waiter = manager.refreshAfterUnauthorized('acc-0');
      manager.setSession({ accessToken: 'acc-0', refreshToken: 'ref-0', expiresAt: T0 + HOUR });
      pending.resolve(payload(1));

      await expect(waiter).resolves.toBe('acc-1');
      expect(onRefreshed).toHaveBeenCalledTimes(1);
      const expiresAt = onRefreshed.mock.calls[0][1];
      manager.setSession({ accessToken: 'acc-1', refreshToken: 'ref-1', expiresAt });
      expect(manager.getSession()).toEqual({ accessToken: 'acc-1', refreshToken: 'ref-1', expiresAt });
      expect(jest.getTimerCount()).toBe(1);
    });
  });

  describe('reactive renewal (401)', () => {
    it('renews with the refresh token, reports the new session (rotated refresh token included), and returns the new access token', async () => {
      refresh.mockResolvedValueOnce(payload(1));
      const manager = started();

      await expect(manager.refreshAfterUnauthorized('acc-0')).resolves.toBe('acc-1');

      expect(refresh).toHaveBeenCalledWith('ref-0');
      expect(onRefreshed).toHaveBeenCalledTimes(1);
      expect(onRefreshed).toHaveBeenCalledWith(payload(1), T0 + HOUR);
      expect(manager.getSession()).toEqual({ accessToken: 'acc-1', refreshToken: 'ref-1', expiresAt: T0 + HOUR });
      await expect(manager.getAccessToken()).resolves.toBe('acc-1');
    });

    it('the NEXT renewal uses the rotated refresh token, never the consumed one', async () => {
      refresh.mockResolvedValueOnce(payload(1)).mockResolvedValueOnce(payload(2));
      const manager = started();

      await manager.refreshAfterUnauthorized('acc-0');
      await manager.refreshAfterUnauthorized('acc-1');

      expect(refresh.mock.calls).toEqual([['ref-0'], ['ref-1']]);
      expect(manager.getSession()?.refreshToken).toBe('ref-2');
    });

    it('single-flight: concurrent 401s share one in-flight refresh', async () => {
      const pending = deferred<SessionPayload>();
      refresh.mockReturnValueOnce(pending.promise);
      const manager = started();

      const results = [
        manager.refreshAfterUnauthorized('acc-0'),
        manager.refreshAfterUnauthorized('acc-0'),
        manager.refreshAfterUnauthorized('acc-0'),
      ];
      expect(refresh).toHaveBeenCalledTimes(1);

      pending.resolve(payload(1));
      await expect(Promise.all(results)).resolves.toEqual(['acc-1', 'acc-1', 'acc-1']);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(onRefreshed).toHaveBeenCalledTimes(1);
    });

    it('single-flight also covers a due getAccessToken racing a 401', async () => {
      const pending = deferred<SessionPayload>();
      refresh.mockReturnValueOnce(pending.promise);
      const manager = started(T0 + 30_000); // due at T0+15s
      now = T0 + 20_000;

      const a = manager.getAccessToken();
      const b = manager.refreshAfterUnauthorized('acc-0');
      pending.resolve(payload(1));

      await expect(Promise.all([a, b])).resolves.toEqual(['acc-1', 'acc-1']);
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('a 401 for a token that was already replaced returns the current token without refreshing', async () => {
      refresh.mockResolvedValueOnce(payload(1));
      const manager = started();
      await manager.refreshAfterUnauthorized('acc-0');

      await expect(manager.refreshAfterUnauthorized('acc-0')).resolves.toBe('acc-1');
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('after a refresh settles, a later 401 starts a new one', async () => {
      refresh.mockResolvedValueOnce(payload(1)).mockResolvedValueOnce(payload(2));
      const manager = started();

      await manager.refreshAfterUnauthorized('acc-0');
      await expect(manager.refreshAfterUnauthorized('acc-1')).resolves.toBe('acc-2');
      expect(refresh).toHaveBeenCalledTimes(2);
    });
  });

  describe('refresh failures', () => {
    it.each([401, 400])('a rejected refresh token (%i) ends the session: onExpired once, null for every waiter, no retry', async (code) => {
      const pending = deferred<SessionPayload>();
      refresh.mockReturnValueOnce(pending.promise);
      const manager = started();

      const waiters = [manager.refreshAfterUnauthorized('acc-0'), manager.refreshAfterUnauthorized('acc-0')];
      pending.reject({ message: 'Invalid or expired refresh token', code });

      await expect(Promise.all(waiters)).resolves.toEqual([null, null]);
      expect(onExpired).toHaveBeenCalledTimes(1);
      expect(onRefreshed).not.toHaveBeenCalled();
      expect(manager.getSession()).toBeNull();
      await expect(manager.getAccessToken()).resolves.toBeNull();
      await expect(manager.refreshAfterUnauthorized('acc-0')).resolves.toBeNull();
      expect(refresh).toHaveBeenCalledTimes(1);
      // No timer left behind to try again.
      await advance(2 * HOUR);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(onExpired).toHaveBeenCalledTimes(1);
    });

    it('a due getAccessToken whose refresh token is dead resolves null', async () => {
      refresh.mockRejectedValueOnce({ message: 'Invalid or expired refresh token', code: 401 });
      const manager = started(T0 + HOUR);
      now = T0 + HOUR; // past due

      await expect(manager.getAccessToken()).resolves.toBeNull();
      expect(onExpired).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['network failure', new TypeError('Network request failed')],
      ['rate limited (429 on /refresh)', { message: 'Too many requests, please try again later.', code: 429 }],
      ['server error', { message: 'Internal server error', code: 500 }],
    ])('a transient failure (%s) keeps the session, never signs out, and rejects the 401 waiters with the retryable error', async (_label, error) => {
      refresh.mockRejectedValueOnce(error);
      const manager = started();

      const waiters = [manager.refreshAfterUnauthorized('acc-0'), manager.refreshAfterUnauthorized('acc-0')];

      for (const w of waiters) await expect(w).rejects.toBe(error);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(onExpired).not.toHaveBeenCalled();
      expect(manager.getSession()).toEqual({ accessToken: 'acc-0', refreshToken: 'ref-0', expiresAt: T0 + HOUR });
    });

    it('after a 429 the next 401 tries again with the same (unconsumed) refresh token, and succeeds', async () => {
      refresh.mockRejectedValueOnce({ message: 'Too many requests', code: 429 }).mockResolvedValueOnce(payload(1));
      const manager = started();

      await expect(manager.refreshAfterUnauthorized('acc-0')).rejects.toMatchObject({ code: 429 });
      await expect(manager.refreshAfterUnauthorized('acc-0')).resolves.toBe('acc-1');

      expect(refresh.mock.calls).toEqual([['ref-0'], ['ref-0']]);
      expect(onExpired).not.toHaveBeenCalled();
    });
    it('a transient failure while due: getAccessToken falls back to the current token (the backend decides)', async () => {
      refresh.mockRejectedValueOnce(new TypeError('Network request failed'));
      const manager = started(T0 + HOUR);
      now = T0 + HOUR - 30_000;

      await expect(manager.getAccessToken()).resolves.toBe('acc-0');
      expect(onExpired).not.toHaveBeenCalled();
    });

    it('retryDelayMs backs off 30s, 1m, 2m, 4m, then caps at 5m', () => {
      expect(RETRY_BASE_DELAY_MS).toBe(30_000);
      expect(RETRY_MAX_DELAY_MS).toBe(300_000);
      expect([0, 1, 2, 3, 4, 5, 10].map(retryDelayMs)).toEqual([30_000, 30_000, 60_000, 120_000, 240_000, 300_000, 300_000]);
    });

    it('a transient failure from the timer re-arms it with backoff (not a tight loop), and succeeds later', async () => {
      const offline = new TypeError('Network request failed');
      refresh.mockRejectedValueOnce(offline).mockRejectedValueOnce(offline).mockResolvedValueOnce(payload(1));
      const manager = started(T0 + HOUR);

      await advance(HOUR - 60_000);
      expect(refresh).toHaveBeenCalledTimes(1);
      await advance(30_000 - 1);
      expect(refresh).toHaveBeenCalledTimes(1);
      await advance(1);
      expect(refresh).toHaveBeenCalledTimes(2);
      await advance(60_000 - 1);
      expect(refresh).toHaveBeenCalledTimes(2);
      await advance(1);
      expect(refresh).toHaveBeenCalledTimes(3);
      expect(manager.getSession()?.accessToken).toBe('acc-1');
      expect(onExpired).not.toHaveBeenCalled();
      // Success resets the backoff and schedules the normal renewal.
      expect(jest.getTimerCount()).toBe(1);
      await advance(HOUR - 60_000);
      expect(refresh).toHaveBeenCalledTimes(4);
    });

    it('a persistently failing backend is retried at most every 5 minutes', async () => {
      refresh.mockRejectedValue({ code: 429 });
      started(T0 + HOUR);

      await advance(HOUR - 60_000); // 1st attempt
      for (const delay of [30_000, 60_000, 120_000, 240_000]) await advance(delay); // attempts 2-5
      expect(refresh).toHaveBeenCalledTimes(5);
      await advance(5 * 60_000 - 1);
      expect(refresh).toHaveBeenCalledTimes(5); // not sooner than the cap
      await advance(1);
      for (let i = 0; i < 11; i++) await advance(5 * 60_000); // the rest of an hour at the cap
      expect(refresh).toHaveBeenCalledTimes(5 + 12);
      expect(onExpired).not.toHaveBeenCalled();
    });

    it('signing out cancels a pending retry', async () => {
      refresh.mockRejectedValueOnce(new TypeError('offline'));
      const manager = started(T0 + HOUR);
      await advance(HOUR - 60_000);
      expect(jest.getTimerCount()).toBe(1);

      manager.setSession(null);

      expect(jest.getTimerCount()).toBe(0);
      await advance(HOUR);
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('a new session resets the backoff', async () => {
      refresh.mockRejectedValueOnce(new TypeError('offline')).mockRejectedValueOnce(new TypeError('offline'));
      const manager = started(T0 + HOUR);
      await advance(HOUR - 60_000);
      await advance(30_000); // 2nd failure -> next retry would be in 60s
      manager.setSession({ accessToken: 'n', refreshToken: 'nr', expiresAt: now + 30_000 }); // due in 15s -> MIN delay 10s... 15s
      refresh.mockRejectedValueOnce(new TypeError('offline'));
      await advance(15_000);
      expect(refresh).toHaveBeenCalledTimes(3);
      await advance(30_000); // first-failure delay again, not 2m
      expect(refresh).toHaveBeenCalledTimes(4);
      expect(refresh).toHaveBeenLastCalledWith('nr');
    });
  });

  describe('sign-out / replaced session while a refresh is in flight', () => {
    it('signing out mid-refresh: the late result is dropped (no resurrected session, no callbacks)', async () => {
      const pending = deferred<SessionPayload>();
      refresh.mockReturnValueOnce(pending.promise);
      const manager = started();

      const waiter = manager.refreshAfterUnauthorized('acc-0');
      manager.setSession(null);
      pending.resolve(payload(1));

      await expect(waiter).resolves.toBeNull();
      expect(onRefreshed).not.toHaveBeenCalled();
      expect(manager.getSession()).toBeNull();
    });

    it('signing out mid-refresh: a late rejection does not fire onExpired', async () => {
      const pending = deferred<SessionPayload>();
      refresh.mockReturnValueOnce(pending.promise);
      const manager = started();

      const waiter = manager.refreshAfterUnauthorized('acc-0');
      manager.setSession(null);
      pending.reject({ code: 401 });

      await expect(waiter).resolves.toBeNull();
      expect(onExpired).not.toHaveBeenCalled();
    });

    it('a new sign-in mid-refresh wins over the stale refresh result', async () => {
      const pending = deferred<SessionPayload>();
      refresh.mockReturnValueOnce(pending.promise);
      const manager = started();

      const waiter = manager.refreshAfterUnauthorized('acc-0');
      manager.setSession({ accessToken: 'login-acc', refreshToken: 'login-ref', expiresAt: T0 + HOUR });
      pending.resolve(payload(1));

      await expect(waiter).resolves.toBe('login-acc');
      expect(onRefreshed).not.toHaveBeenCalled();
      expect(manager.getSession()?.accessToken).toBe('login-acc');
    });

    it('a new sign-in mid-refresh: a late dead-token rejection does not sign the new session out', async () => {
      const pending = deferred<SessionPayload>();
      refresh.mockReturnValueOnce(pending.promise);
      const manager = started();

      const waiter = manager.refreshAfterUnauthorized('acc-0');
      manager.setSession({ accessToken: 'login-acc', refreshToken: 'login-ref', expiresAt: T0 + HOUR });
      pending.reject({ code: 401 });

      await expect(waiter).resolves.toBe('login-acc');
      expect(onExpired).not.toHaveBeenCalled();
      expect(manager.getSession()?.accessToken).toBe('login-acc');
    });

    it('a new sign-in starts its own refresh instead of joining the stale in-flight one', async () => {
      const stale = deferred<SessionPayload>();
      refresh.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(payload(9));
      const manager = started();

      void manager.refreshAfterUnauthorized('acc-0');
      manager.setSession({ accessToken: 'login-acc', refreshToken: 'login-ref', expiresAt: T0 + HOUR });

      await expect(manager.refreshAfterUnauthorized('login-acc')).resolves.toBe('acc-9');
      expect(refresh.mock.calls).toEqual([['ref-0'], ['login-ref']]);
      stale.resolve(payload(1));
      await flush();
      expect(manager.getSession()?.accessToken).toBe('acc-9');
    });
  });

  describe('proactive renewal: timer', () => {
    it('refreshes 60s before expiry, then re-arms for the renewed token', async () => {
      refresh.mockResolvedValueOnce(payload(1)).mockResolvedValueOnce(payload(2));
      started(T0 + HOUR);

      await advance(HOUR - 60_000 - 1);
      expect(refresh).not.toHaveBeenCalled();
      await advance(1);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(refresh).toHaveBeenLastCalledWith('ref-0');
      expect(onRefreshed).toHaveBeenCalledTimes(1);

      // The renewed token (expires_in 3600 from now) gets its own timer.
      await advance(HOUR - 60_000);
      expect(refresh).toHaveBeenCalledTimes(2);
      expect(refresh).toHaveBeenLastCalledWith('ref-1');
    });

    it('never schedules sooner than MIN_REFRESH_DELAY_MS (no refresh loop on an odd/short expiry)', async () => {
      expect(MIN_REFRESH_DELAY_MS).toBe(10_000);
      refresh.mockResolvedValue(payload(1, { expires_in: 1 }));
      started(T0 + 1_000);

      await advance(MIN_REFRESH_DELAY_MS - 1);
      expect(refresh).not.toHaveBeenCalled();
      await advance(1);
      expect(refresh).toHaveBeenCalledTimes(1);
      // Even a server handing out 1s tokens gets at most one refresh per 10s.
      await advance(MIN_REFRESH_DELAY_MS - 1);
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('does not schedule anything when the expiry is unknown', async () => {
      started(null);
      expect(jest.getTimerCount()).toBe(0);
      await advance(10 * HOUR);
      expect(refresh).not.toHaveBeenCalled();
    });

    it('signing out clears the timer', async () => {
      const manager = started(T0 + HOUR);
      expect(jest.getTimerCount()).toBe(1);

      manager.setSession(null);

      expect(jest.getTimerCount()).toBe(0);
      await advance(2 * HOUR);
      expect(refresh).not.toHaveBeenCalled();
    });

    it('dispose (App unmount) clears the timer and forgets the session', async () => {
      const manager = started(T0 + HOUR);

      manager.dispose();

      expect(jest.getTimerCount()).toBe(0);
      expect(manager.getSession()).toBeNull();
      await advance(2 * HOUR);
      expect(refresh).not.toHaveBeenCalled();
    });

    it('a later setSession after dispose starts over (React StrictMode re-runs effects)', () => {
      const manager = started(T0 + HOUR);
      manager.dispose();
      manager.setSession({ accessToken: 'acc-0', refreshToken: 'ref-0', expiresAt: T0 + HOUR });
      expect(manager.getSession()?.accessToken).toBe('acc-0');
      expect(jest.getTimerCount()).toBe(1);
    });

    it('a new session replaces the old timer (only one timer at a time)', async () => {
      refresh.mockResolvedValue(payload(5));
      const manager = started(T0 + HOUR);
      manager.setSession({ accessToken: 'acc-9', refreshToken: 'ref-9', expiresAt: T0 + 2 * HOUR });
      expect(jest.getTimerCount()).toBe(1);

      await advance(HOUR);
      expect(refresh).not.toHaveBeenCalled();
      await advance(HOUR - 60_000);
      expect(refresh).toHaveBeenCalledWith('ref-9');
    });

    it('a reactive refresh re-arms the timer from the renewed expiry', async () => {
      refresh.mockResolvedValueOnce(payload(1)).mockResolvedValueOnce(payload(2));
      const manager = started(T0 + HOUR);
      await advance(30 * 60_000);
      await manager.refreshAfterUnauthorized('acc-0'); // renewed at T0+30min, expires T0+90min

      await advance(HOUR - 60_000 - 1);
      expect(refresh).toHaveBeenCalledTimes(1);
      await advance(1);
      expect(refresh).toHaveBeenCalledTimes(2);
      expect(jest.getTimerCount()).toBe(1);
    });

    it('honors a custom leeway', async () => {
      refresh.mockResolvedValue(payload(1));
      const manager = make({ leewayMs: 5 * 60_000 });
      manager.setSession({ accessToken: 'acc-0', refreshToken: 'ref-0', expiresAt: T0 + HOUR });

      await advance(HOUR - 5 * 60_000);
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('proactive renewal: getAccessToken', () => {
    it('refreshes first when the token is due, and returns the renewed one', async () => {
      refresh.mockResolvedValueOnce(payload(1));
      const manager = started(T0 + HOUR);
      now = T0 + HOUR - 59_000;

      await expect(manager.getAccessToken()).resolves.toBe('acc-1');
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('does not refresh just before the due time', async () => {
      const manager = started(T0 + HOUR);
      now = T0 + HOUR - 61_000;

      await expect(manager.getAccessToken()).resolves.toBe('acc-0');
      expect(refresh).not.toHaveBeenCalled();
    });
  });

  describe('proactive renewal: app returns to the foreground', () => {
    it("'active' with a due/expired token refreshes (timers don't run while iOS suspends the app)", async () => {
      refresh.mockResolvedValueOnce(payload(1));
      const manager = started(T0 + HOUR);
      now = T0 + 2 * HOUR; // was in the background past expiry; timer hasn't fired yet

      manager.handleAppStateChange('active');
      await flush();

      expect(refresh).toHaveBeenCalledTimes(1);
      expect(onRefreshed).toHaveBeenCalledTimes(1);
      expect(manager.getSession()?.accessToken).toBe('acc-1');
    });

    it("'active' with a fresh token does nothing", async () => {
      const manager = started(T0 + HOUR);
      now = T0 + 10 * 60_000;

      manager.handleAppStateChange('active');
      await flush();

      expect(refresh).not.toHaveBeenCalled();
    });

    it.each(['background', 'inactive', 'unknown'])("'%s' never refreshes, even when due", async (state) => {
      const manager = started(T0 + HOUR);
      now = T0 + 2 * HOUR;

      manager.handleAppStateChange(state);
      await flush();

      expect(refresh).not.toHaveBeenCalled();
    });

    it("'active' while signed out does nothing", async () => {
      const manager = make();
      manager.handleAppStateChange('active');
      await flush();
      expect(refresh).not.toHaveBeenCalled();
    });

    it("'active' joins an in-flight refresh instead of starting a second one", async () => {
      const pending = deferred<SessionPayload>();
      refresh.mockReturnValueOnce(pending.promise);
      const manager = started(T0 + HOUR);
      now = T0 + 2 * HOUR;

      const waiter = manager.getAccessToken();
      manager.handleAppStateChange('active');
      pending.resolve(payload(1));

      await expect(waiter).resolves.toBe('acc-1');
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("'active' with a transient failure keeps the session (no sign-out, no unhandled rejection) and retries on backoff", async () => {
      refresh.mockRejectedValueOnce({ message: 'Too many requests', code: 429 }).mockResolvedValueOnce(payload(1));
      const manager = started(T0 + HOUR);
      now = T0 + 2 * HOUR;

      manager.handleAppStateChange('active');
      await flush();
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(onExpired).not.toHaveBeenCalled();
      expect(manager.getSession()?.accessToken).toBe('acc-0');

      await advance(RETRY_BASE_DELAY_MS);
      expect(refresh).toHaveBeenCalledTimes(2);
      expect(manager.getSession()?.accessToken).toBe('acc-1');
    });

    it("'active' with a dead refresh token signs out once", async () => {
      refresh.mockRejectedValueOnce({ code: 401 });
      const manager = started(T0 + HOUR);
      now = T0 + 2 * HOUR;

      manager.handleAppStateChange('active');
      await flush();
      manager.handleAppStateChange('active');
      await flush();

      expect(onExpired).toHaveBeenCalledTimes(1);
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });

  it('uses Date.now by default', async () => {
    jest.useRealTimers();
    refresh.mockResolvedValueOnce(payload(1));
    const manager = createSessionManager({ refresh, onRefreshed, onExpired });
    manager.setSession({ accessToken: 'acc-0', refreshToken: 'ref-0', expiresAt: Date.now() - 1 });

    await expect(manager.getAccessToken()).resolves.toBe('acc-1');
    manager.dispose();
  });
});
