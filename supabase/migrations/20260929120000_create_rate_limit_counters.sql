-- Shared express-rate-limit counters (apps/backend/src/services/rateLimitStore.ts,
-- RATE_LIMIT_STORE=postgres). On Cloud Run several instances run at once and
-- instances scale to zero, so per-process in-memory counters would multiply
-- or reset the login brute-force limits. One row per limiter-prefixed key
-- (e.g. 'auth:203.0.113.7'), fixed window.
--
-- Backend-only: RLS on with NO policies, no table grants to anon/authenticated,
-- functions executable by service_role only. Idempotent (safe to re-run).

CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL DEFAULT 0 CHECK (hits >= 0),
  reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS rate_limit_counters_reset_at_idx ON public.rate_limit_counters (reset_at);

ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

-- Supabase's default privileges grant ALL on new public tables to anon and
-- authenticated: revoke explicitly (RLS without policies already denies them,
-- this is the second lock).
REVOKE ALL ON TABLE public.rate_limit_counters FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rate_limit_counters TO service_role;

-- ------------------------------------------------------------ increment
-- Atomic under concurrency: a single INSERT ... ON CONFLICT DO UPDATE ...
-- RETURNING. Either creates the key's window (hits=1), bumps it, or — if the
-- stored window has expired — starts a new one (hits=1, fresh reset_at).
-- Postgres guarantees exactly one of insert/update per concurrent caller, so
-- no hit is lost and two callers can't both "start" the window.
--
-- Cleanup: ~2% of calls also delete up to 500 rows whose window ended more
-- than a minute ago. SKIP LOCKED means cleanup never waits on (or blocks) a
-- concurrent increment; the reset_at index keeps the scan cheap.
--
-- SECURITY INVOKER: only service_role can execute it, and service_role owns
-- the table grants and bypasses RLS; anon/authenticated would get nothing
-- even if EXECUTE were ever granted by mistake.
CREATE OR REPLACE FUNCTION public.rate_limit_increment(p_key TEXT, p_window_ms INTEGER)
RETURNS TABLE (total_hits INTEGER, reset_time TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_key IS NULL OR length(p_key) = 0 OR length(p_key) > 512 THEN
    RAISE EXCEPTION 'rate_limit_increment: invalid key';
  END IF;
  IF p_window_ms IS NULL OR p_window_ms <= 0 THEN
    RAISE EXCEPTION 'rate_limit_increment: invalid window';
  END IF;

  RETURN QUERY
  INSERT INTO public.rate_limit_counters AS c (key, hits, reset_at)
  VALUES (p_key, 1, v_now + make_interval(secs => p_window_ms / 1000.0))
  ON CONFLICT (key) DO UPDATE
    SET hits     = CASE WHEN c.reset_at <= v_now THEN 1 ELSE c.hits + 1 END,
        reset_at = CASE WHEN c.reset_at <= v_now THEN EXCLUDED.reset_at ELSE c.reset_at END
  RETURNING c.hits, c.reset_at;

  IF random() < 0.02 THEN
    DELETE FROM public.rate_limit_counters d
    WHERE d.key IN (
      SELECT e.key FROM public.rate_limit_counters e
      WHERE e.reset_at < v_now - interval '1 minute'
      LIMIT 500
      FOR UPDATE SKIP LOCKED
    );
  END IF;
END;
$$;

-- ------------------------------------------------------------ decrement
-- Only used if a limiter enables skipSuccessfulRequests/skipFailedRequests.
-- Never goes below 0 and never touches an expired window.
CREATE OR REPLACE FUNCTION public.rate_limit_decrement(p_key TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  UPDATE public.rate_limit_counters
  SET hits = greatest(hits - 1, 0)
  WHERE key = p_key AND reset_at > clock_timestamp();
$$;

-- ------------------------------------------------------------ reset
CREATE OR REPLACE FUNCTION public.rate_limit_reset(p_key TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  DELETE FROM public.rate_limit_counters WHERE key = p_key;
$$;

-- ------------------------------------------------------------------ GRANTs
-- Supabase grants EXECUTE on new public functions to anon/authenticated by
-- default (and PostgREST exposes them as /rpc/*): revoke explicitly.
REVOKE ALL ON FUNCTION public.rate_limit_increment(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rate_limit_decrement(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rate_limit_reset(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_increment(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.rate_limit_decrement(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.rate_limit_reset(TEXT) TO service_role;
