-- Link budgets to categories by id.
--
-- Adds budgets.category_id (FK -> categories), backfills it from the existing
-- free-text `category` by case-insensitive match against the BASE names
-- (anything unmatched -> base "Other"), then makes it NOT NULL and
-- UNIQUE (user_id, category_id).
--
-- The `category` text column is KEPT (the mobile API still reads it). From
-- now on it is derived from category_id by a trigger on every write, so the
-- two can never disagree: budgets.category = categories.name of category_id.
-- The backfill therefore also rewrites `category` to the canonical base name
-- (e.g. 'groceries' -> 'Groceries', 'Pets' -> 'Other'). Budgets written by
-- the API were always one of the exact 6 names, so for them nothing changes;
-- only rows written straight through PostgREST can be affected.
--
-- SAFETY: if the mapping would give one user two budgets for the same
-- category (e.g. 'Pets' and 'Other' both -> Other), the migration raises and
-- the whole file rolls back — no user data is silently merged or deleted.
-- Pre-check query is in the item 7 report.
--
-- Safe to re-run.

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id);

DO $$
DECLARE
  v_collisions INTEGER;
BEGIN
  SELECT count(*) INTO v_collisions FROM (
    SELECT b.user_id,
           COALESCE(b.category_id, base.id, '00000000-0000-4000-8000-000000000006'::uuid) AS mapped
    FROM public.budgets b
    LEFT JOIN public.categories base
      ON base.user_id IS NULL AND lower(base.name) = lower(btrim(b.category))
    GROUP BY 1, 2
    HAVING count(*) > 1
  ) dup;

  IF v_collisions > 0 THEN
    RAISE EXCEPTION 'budgets backfill aborted: % (user, category) pair(s) would collide after mapping to base categories; resolve them by hand first', v_collisions;
  END IF;
END;
$$;

UPDATE public.budgets b
SET category_id = COALESCE(
      (SELECT c.id FROM public.categories c
       WHERE c.user_id IS NULL AND lower(c.name) = lower(btrim(b.category))),
      '00000000-0000-4000-8000-000000000006'::uuid)
WHERE b.category_id IS NULL;

-- Canonical names (see header). Only rows that differ are touched.
UPDATE public.budgets b
SET category = c.name
FROM public.categories c
WHERE c.id = b.category_id AND b.category IS DISTINCT FROM c.name;

ALTER TABLE public.budgets ALTER COLUMN category_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'budgets_user_id_category_id_key' AND conrelid = 'public.budgets'::regclass
  ) THEN
    ALTER TABLE public.budgets
      ADD CONSTRAINT budgets_user_id_category_id_key UNIQUE (user_id, category_id);
  END IF;
END;
$$;

-- FK lookups when a category is deleted.
CREATE INDEX IF NOT EXISTS budgets_category_id_idx ON public.budgets(category_id);

-- Keep `category` derived from category_id (filling category_id from the
-- name when a legacy writer omits it), and refuse a category that is
-- neither base nor owned by the budget's user. Clients can still INSERT /
-- UPDATE their own budgets through PostgREST (existing RLS policies), so the
-- DB enforces this rather than trusting the API. SECURITY INVOKER: a client
-- only sees base + own categories, so another user's category id simply
-- isn't found and is rejected.
CREATE OR REPLACE FUNCTION public.budgets_sync_category()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_name TEXT;
BEGIN
  -- Backward compatibility: a writer that only sends the text `category`
  -- (the backend build running before this change is deployed, older
  -- verify scripts) gets category_id resolved from the name — base first,
  -- then the user's own custom category, case-insensitive. Same when an
  -- UPDATE changes only the text. No match -> category_id is NULL and the
  -- check below rejects the row.
  IF NEW.category IS NOT NULL AND (
       NEW.category_id IS NULL
       OR (TG_OP = 'UPDATE'
           AND NEW.category IS DISTINCT FROM OLD.category
           AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id)
     ) THEN
    NEW.category_id := NULL;
    SELECT c.id INTO NEW.category_id
    FROM public.categories c
    WHERE lower(c.name) = lower(btrim(NEW.category))
      AND (c.user_id IS NULL OR c.user_id = NEW.user_id)
    ORDER BY c.user_id NULLS FIRST
    LIMIT 1;
  END IF;

  SELECT c.name INTO v_name
  FROM public.categories c
  WHERE c.id = NEW.category_id
    AND (c.user_id IS NULL OR c.user_id = NEW.user_id);

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'budget category % is not available to this user', NEW.category_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  NEW.category := v_name;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS budgets_sync_category ON public.budgets;
CREATE TRIGGER budgets_sync_category
BEFORE INSERT OR UPDATE ON public.budgets
FOR EACH ROW
EXECUTE FUNCTION public.budgets_sync_category();

REVOKE ALL ON FUNCTION public.budgets_sync_category() FROM PUBLIC, anon, authenticated;
