// express-rate-limit Store backed by Supabase Postgres (table
// public.rate_limit_counters, migration 20260929120000). Counters are shared
// by every Cloud Run instance and survive restarts / scale-to-zero, unlike
// the default per-process MemoryStore.
//
// All access goes through SECURITY INVOKER SQL functions that only
// service_role may execute; the table has RLS on and no anon/authenticated
// grants (checked by scripts/verify-rls.ts).
//
// Failure policy: FAIL OPEN. If the RPC errors or times out, increment()
// logs loudly and rejects; the limiter is configured with
// passOnStoreError: true, so the request proceeds un-limited. Availability
// of login/scan beats brute-force protection during a DB outage (and during
// a DB outage login itself can't succeed anyway).
import type { Options, Store, IncrementResponse } from 'express-rate-limit';
import { supabase } from '@smartbudget/shared/lib/supabase';

export const RPC_TIMEOUT_MS = 2000;

type RpcResult = { data: unknown; error: { message?: string } | null };

function withTimeout<T>(promise: PromiseLike<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

export class PostgresStore implements Store {
  /** Keys in one instance affect every other instance (shared DB). */
  localKeys = false;
  prefix: string;
  windowMs = 60_000;

  constructor(prefix: string, private readonly timeoutMs = RPC_TIMEOUT_MS) {
    // One prefix per limiter: they all share one table.
    this.prefix = prefix.endsWith(':') ? prefix : `${prefix}:`;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private async rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await withTimeout<RpcResult>(
      supabase.rpc(fn, args) as unknown as PromiseLike<RpcResult>,
      this.timeoutMs,
      fn
    );
    if (error) throw new Error(`${fn} failed: ${error.message ?? JSON.stringify(error)}`);
    return data;
  }

  async increment(key: string): Promise<IncrementResponse> {
    try {
      const data = await this.rpc('rate_limit_increment', { p_key: this.prefix + key, p_window_ms: this.windowMs });
      const row = (Array.isArray(data) ? data[0] : data) as { total_hits?: unknown; reset_time?: unknown } | undefined;
      const totalHits = Number(row?.total_hits);
      const resetTime = new Date(String(row?.reset_time));
      if (!Number.isInteger(totalHits) || totalHits < 1 || Number.isNaN(resetTime.getTime())) {
        throw new Error(`rate_limit_increment returned an unexpected row: ${JSON.stringify(data)}`);
      }
      return { totalHits, resetTime };
    } catch (err) {
      console.error(
        `[rate-limit] Postgres store FAILED for ${this.prefix}* - FAILING OPEN (request allowed without rate limiting): ${
          (err as Error).message
        }`
      );
      throw err;
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      await this.rpc('rate_limit_decrement', { p_key: this.prefix + key });
    } catch (err) {
      console.error(`[rate-limit] Postgres store decrement failed for ${this.prefix}*: ${(err as Error).message}`);
    }
  }

  async resetKey(key: string): Promise<void> {
    try {
      await this.rpc('rate_limit_reset', { p_key: this.prefix + key });
    } catch (err) {
      console.error(`[rate-limit] Postgres store resetKey failed for ${this.prefix}*: ${(err as Error).message}`);
    }
  }
}
