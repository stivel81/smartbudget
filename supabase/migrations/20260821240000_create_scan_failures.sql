-- Currently a failed receipt scan (Claude error, bad extraction, etc.)
-- just returns a 500 with nothing persisted — there's no way to see failed
-- scans at all. This logs each failure for admin visibility.
-- ON DELETE CASCADE mirrors receipts/budgets: a user's failure logs are
-- their own activity data and should go with the rest on right-to-erasure.
CREATE TABLE public.scan_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  error_message TEXT NOT NULL,
  media_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX scan_failures_created_at_idx ON public.scan_failures(created_at DESC);
CREATE INDEX scan_failures_user_id_idx ON public.scan_failures(user_id);

ALTER TABLE public.scan_failures ENABLE ROW LEVEL SECURITY;
