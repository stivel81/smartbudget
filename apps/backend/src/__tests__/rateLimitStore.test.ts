// Unit tests for the Postgres-backed express-rate-limit store, with the
// Supabase RPC mocked. The SQL's own atomicity/window-reset behaviour lives
// in migration 20260929120000 (verified against a real Postgres separately);
// here we check the store's contract: key prefixing, window forwarding,
// response mapping, and FAIL-OPEN on errors/timeouts.
const mockRpc = jest.fn();
jest.mock('@smartbudget/shared/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

import type { Options } from 'express-rate-limit';
import { PostgresStore } from '../services/rateLimitStore';

const WINDOW_MS = 15 * 60 * 1000;

function makeStore(prefix = 'auth', timeoutMs?: number) {
  const store = new PostgresStore(prefix, timeoutMs);
  store.init({ windowMs: WINDOW_MS } as Options);
  return store;
}

// A tiny stand-in for the SQL function's semantics (fixed window, reset on
// expiry), so a sequence of increments can be exercised end to end.
function fakeCounterRpc(now: () => number) {
  const rows = new Map<string, { hits: number; resetAt: number }>();
  return async (fn: string, args: { p_key: string; p_window_ms?: number }) => {
    if (fn === 'rate_limit_increment') {
      const row = rows.get(args.p_key);
      if (!row || row.resetAt <= now()) {
        rows.set(args.p_key, { hits: 1, resetAt: now() + args.p_window_ms! });
      } else {
        row.hits += 1;
      }
      const r = rows.get(args.p_key)!;
      return { data: [{ total_hits: r.hits, reset_time: new Date(r.resetAt).toISOString() }], error: null };
    }
    if (fn === 'rate_limit_reset') {
      rows.delete(args.p_key);
      return { data: null, error: null };
    }
    return { data: null, error: null };
  };
}

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  mockRpc.mockReset();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe('PostgresStore', () => {
  it('is a shared (non-local) store with a per-limiter prefix', () => {
    const store = makeStore('auth');
    expect(store.localKeys).toBe(false);
    expect(store.prefix).toBe('auth:');
    expect(new PostgresStore('scan:').prefix).toBe('scan:');
  });

  it('increments via RPC with the prefixed key and the limiter window', async () => {
    const resetTime = '2026-09-29T12:15:00.000Z';
    mockRpc.mockResolvedValueOnce({ data: [{ total_hits: 3, reset_time: resetTime }], error: null });

    const result = await makeStore('auth').increment('203.0.113.7');

    expect(mockRpc).toHaveBeenCalledWith('rate_limit_increment', { p_key: 'auth:203.0.113.7', p_window_ms: WINDOW_MS });
    expect(result).toEqual({ totalHits: 3, resetTime: new Date(resetTime) });
  });

  it('accepts a single-object RPC response too', async () => {
    mockRpc.mockResolvedValueOnce({ data: { total_hits: 1, reset_time: '2026-09-29T12:15:00Z' }, error: null });
    await expect(makeStore().increment('k')).resolves.toMatchObject({ totalHits: 1 });
  });

  it('counts up within a window and starts a fresh window once it expires', async () => {
    let now = Date.parse('2026-09-29T12:00:00Z');
    mockRpc.mockImplementation(fakeCounterRpc(() => now));
    const store = makeStore('auth');

    const first = await store.increment('ip');
    const second = await store.increment('ip');
    expect([first.totalHits, second.totalHits]).toEqual([1, 2]);
    expect(second.resetTime).toEqual(first.resetTime);
    expect(first.resetTime!.getTime()).toBe(now + WINDOW_MS);

    now += WINDOW_MS; // window over
    const afterReset = await store.increment('ip');
    expect(afterReset.totalHits).toBe(1);
    expect(afterReset.resetTime!.getTime()).toBe(now + WINDOW_MS);
  });

  it('keeps limiters apart via the prefix', async () => {
    const now = Date.now();
    mockRpc.mockImplementation(fakeCounterRpc(() => now));
    const auth = makeStore('auth');
    const scan = makeStore('scan');
    await auth.increment('ip');
    await auth.increment('ip');
    expect((await scan.increment('ip')).totalHits).toBe(1);
    expect((await auth.increment('ip')).totalHits).toBe(3);
  });

  it('resetKey and decrement call their RPCs with the prefixed key', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const store = makeStore('auth');
    await store.resetKey('ip');
    await store.decrement('ip');
    expect(mockRpc).toHaveBeenCalledWith('rate_limit_reset', { p_key: 'auth:ip' });
    expect(mockRpc).toHaveBeenCalledWith('rate_limit_decrement', { p_key: 'auth:ip' });
  });

  describe('fail-open', () => {
    it('rejects (so the limiter passes the request) and logs loudly on an RPC error', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'connection refused' } });

      await expect(makeStore('auth').increment('ip')).rejects.toThrow(/connection refused/);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/Postgres store FAILED for auth:\* - FAILING OPEN.*connection refused/));
    });

    it('rejects when the RPC itself throws', async () => {
      mockRpc.mockRejectedValueOnce(new Error('fetch failed'));
      await expect(makeStore().increment('ip')).rejects.toThrow(/fetch failed/);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/FAILING OPEN/));
    });

    it('times out instead of hanging the request', async () => {
      mockRpc.mockReturnValueOnce(new Promise(() => {}));
      await expect(makeStore('auth', 20).increment('ip')).rejects.toThrow(/timed out after 20ms/);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/FAILING OPEN/));
    });

    it('rejects a malformed RPC response rather than returning bogus counts', async () => {
      mockRpc.mockResolvedValueOnce({ data: [], error: null });
      await expect(makeStore().increment('ip')).rejects.toThrow(/unexpected row/);
    });

    it('never throws from decrement/resetKey (best effort)', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'down' } });
      const store = makeStore();
      await expect(store.decrement('ip')).resolves.toBeUndefined();
      await expect(store.resetKey('ip')).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledTimes(2);
    });
  });
});
