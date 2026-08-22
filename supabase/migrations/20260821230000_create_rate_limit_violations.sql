-- Records every request rejected by express-rate-limit (see src/index.ts's
-- authLimiter/scanLimiter handler), so admins have visibility into abuse
-- patterns instead of only the in-memory (per-process, resets on restart)
-- counters express-rate-limit itself keeps.
CREATE TABLE public.rate_limit_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip TEXT,
  route TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX rate_limit_violations_created_at_idx ON public.rate_limit_violations(created_at DESC);

ALTER TABLE public.rate_limit_violations ENABLE ROW LEVEL SECURITY;
