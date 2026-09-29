-- Line items extracted from receipts, one row per raw_response.items[] entry.
--
-- receipts.raw_response stays the source of truth and keeps driving every
-- current read; this table is a derived copy the backend keeps in sync on
-- every receipt write (apps/backend/src/services/transactionSync.ts). Nothing
-- reads it yet.
--
-- Mapping rules (identical in the backfill below and in transactionSync.ts):
--   position    = the item's 0-based index in raw_response.items
--   category_id = base category whose name matches item.category
--                 (trimmed, case-insensitive), else the user's custom
--                 category with that name, else base "Other"
--   name        = item.name when it is a JSON string, else NULL
--   amount      = item.amount when it is a JSON number or a plain decimal
--                 string ("12.50", "-3"); items without a usable amount are
--                 SKIPPED (amount is NOT NULL). Their position is not reused.
--   date        = raw_response.date when it is a valid YYYY-MM-DD date, else
--                 the receipt's created_at (UTC) date — the same fallback the
--                 mobile app uses to place a receipt in a month.
--
-- Safe to re-run: IF NOT EXISTS / OR REPLACE, and the backfill uses
-- ON CONFLICT (receipt_id, position) DO NOTHING.

CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- NO ACTION (not CASCADE): a category that still has transactions can't be
  -- deleted except through delete_custom_category(), which reassigns them to
  -- "Other" first. NO ACTION (not RESTRICT) is checked at end of statement,
  -- so deleting a user still cascades cleanly through categories+transactions.
  category_id UUID NOT NULL REFERENCES public.categories(id),
  name TEXT,
  amount NUMERIC NOT NULL,
  date DATE,
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Also the receipt_id index (leading column): per-receipt delete+insert
  -- sync and the ON DELETE CASCADE from receipts use it.
  CONSTRAINT transactions_receipt_id_position_key UNIQUE (receipt_id, position)
);

CREATE INDEX IF NOT EXISTS transactions_user_id_date_idx ON public.transactions(user_id, date);
CREATE INDEX IF NOT EXISTS transactions_category_id_idx ON public.transactions(category_id);

-- Integrity guard (defense in depth; only the service role writes here):
-- the transaction's user must own the receipt, and the category must be
-- base or that user's own custom category.
CREATE OR REPLACE FUNCTION public.transactions_check_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.receipts r WHERE r.id = NEW.receipt_id AND r.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'transaction user does not own receipt %', NEW.receipt_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = NEW.category_id AND (c.user_id IS NULL OR c.user_id = NEW.user_id)
  ) THEN
    RAISE EXCEPTION 'transaction category % is not available to this user', NEW.category_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_check_ownership ON public.transactions;
CREATE TRIGGER transactions_check_ownership
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.transactions_check_ownership();

-- ---------------------------------------------------------------- RLS
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select their own transactions" ON public.transactions;
CREATE POLICY "Users can select their own transactions"
ON public.transactions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies: clients can't write transactions. The
-- backend (service role, bypasses RLS) is the only writer.

-- ---------------------------------------------------------------- GRANTs
-- Read-only for signed-in users; nothing for anon. Without write GRANTs a
-- client write fails with "permission denied" before RLS is even consulted.
REVOKE ALL ON public.transactions FROM anon, authenticated;
GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;

REVOKE ALL ON FUNCTION public.transactions_check_ownership() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- backfill
-- Session-local helpers (pg_temp): gone when the migration's connection
-- closes, never exposed through PostgREST.
CREATE OR REPLACE FUNCTION pg_temp.item_iso_date(p TEXT)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p IS NULL OR p !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RETURN NULL;
  END IF;
  -- The cast raises on impossible dates such as 2026-02-31 -> NULL.
  RETURN p::date;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.item_amount(p JSONB)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN jsonb_typeof(p) = 'number' THEN (p #>> '{}')::numeric
    WHEN jsonb_typeof(p) = 'string' AND btrim(p #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN btrim(p #>> '{}')::numeric
  END
$$;

INSERT INTO public.transactions (receipt_id, user_id, category_id, name, amount, date, position)
SELECT
  r.id,
  r.user_id,
  COALESCE(base.id, custom.id, '00000000-0000-4000-8000-000000000006'::uuid),
  CASE WHEN jsonb_typeof(e.item -> 'name') = 'string' THEN e.item ->> 'name' END,
  pg_temp.item_amount(e.item -> 'amount'),
  COALESCE(
    pg_temp.item_iso_date(CASE WHEN jsonb_typeof(r.raw_response -> 'date') = 'string' THEN r.raw_response ->> 'date' END),
    (r.created_at AT TIME ZONE 'UTC')::date
  ),
  (e.ord - 1)::integer
FROM public.receipts r
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(r.raw_response -> 'items') = 'array' THEN r.raw_response -> 'items' ELSE '[]'::jsonb END
) WITH ORDINALITY AS e(item, ord)
LEFT JOIN public.categories base
  ON base.user_id IS NULL
 AND jsonb_typeof(e.item -> 'category') = 'string'
 AND lower(base.name) = lower(btrim(e.item ->> 'category'))
LEFT JOIN public.categories custom
  ON custom.user_id = r.user_id
 AND jsonb_typeof(e.item -> 'category') = 'string'
 AND lower(custom.name) = lower(btrim(e.item ->> 'category'))
WHERE jsonb_typeof(e.item) = 'object'
  AND pg_temp.item_amount(e.item -> 'amount') IS NOT NULL
ON CONFLICT (receipt_id, position) DO NOTHING;
