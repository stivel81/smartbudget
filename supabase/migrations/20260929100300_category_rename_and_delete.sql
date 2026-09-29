-- Keep receipts.raw_response, budgets and transactions consistent when a
-- CUSTOM category is renamed or deleted.
--
-- 1. receipt_items_rename_category(items, from, to): pure helper, returns the
--    items array with every item whose category matches `from` (trimmed,
--    case-insensitive — the same match the transaction sync uses) set to `to`.
--
-- 2. RENAME (trigger, fires for the API and for a direct PostgREST rename
--    alike): rewrites that user's raw_response items from the old name to the
--    new one and refreshes budgets.category. Without this, the next sync of a
--    receipt would no longer find the old name and would silently move its
--    items to "Other", and the budget's text name would go stale.
--    transactions need nothing: they reference the category by id.
--
-- 3. DELETE — delete_custom_category(user, category), called by the backend
--    via RPC. In ONE transaction: reassigns that user's transactions to base
--    "Other", rewrites the category name in that user's raw_response items to
--    "Other", deletes that user's budget for the category, deletes the
--    category. Returns false (and changes nothing) when the id is not a
--    custom category of that user (base, someone else's, or missing).
--    Callable ONLY by service_role: it takes the user id as a parameter, so
--    exposing it to clients would let anyone act on another user's data.
--
-- Safe to re-run: CREATE OR REPLACE / DROP TRIGGER IF EXISTS.

CREATE OR REPLACE FUNCTION public.receipt_items_rename_category(p_items JSONB, p_from TEXT, p_to TEXT)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN p_items
    ELSE COALESCE(
      (SELECT jsonb_agg(
                CASE
                  WHEN jsonb_typeof(e.item) = 'object'
                   AND jsonb_typeof(e.item -> 'category') = 'string'
                   AND lower(btrim(e.item ->> 'category')) = lower(btrim(p_from))
                  THEN jsonb_set(e.item, '{category}', to_jsonb(p_to))
                  ELSE e.item
                END
                ORDER BY e.ord)
       FROM jsonb_array_elements(p_items) WITH ORDINALITY AS e(item, ord)),
      '[]'::jsonb)
  END
$$;

-- ------------------------------------------------------------------ rename
-- SECURITY DEFINER: a client renaming its own category directly has no
-- UPDATE right on receipts. Safe because it only ever touches rows of
-- NEW.user_id, and RLS on categories already guaranteed the caller owns NEW.
CREATE OR REPLACE FUNCTION public.categories_after_rename()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.budgets b
  SET category = NEW.name
  WHERE b.user_id = NEW.user_id AND b.category_id = NEW.id;

  UPDATE public.receipts r
  SET raw_response = jsonb_set(
        r.raw_response, '{items}',
        public.receipt_items_rename_category(r.raw_response -> 'items', OLD.name, NEW.name))
  WHERE r.user_id = NEW.user_id
    AND jsonb_typeof(r.raw_response -> 'items') = 'array'
    AND public.receipt_items_rename_category(r.raw_response -> 'items', OLD.name, NEW.name)
        IS DISTINCT FROM r.raw_response -> 'items';

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS categories_after_rename ON public.categories;
CREATE TRIGGER categories_after_rename
AFTER UPDATE OF name ON public.categories
FOR EACH ROW
WHEN (OLD.name IS DISTINCT FROM NEW.name AND NEW.user_id IS NOT NULL)
EXECUTE FUNCTION public.categories_after_rename();

-- ------------------------------------------------------------------ delete
-- SECURITY INVOKER: only service_role may execute it, and service_role
-- bypasses RLS.
CREATE OR REPLACE FUNCTION public.delete_custom_category(p_user_id UUID, p_category_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  c_other CONSTANT UUID := '00000000-0000-4000-8000-000000000006';
  v_name TEXT;
BEGIN
  IF p_user_id IS NULL OR p_category_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Row lock: a concurrent transaction insert referencing this category
  -- (FOR KEY SHARE via the FK) waits for us, then fails its FK check.
  SELECT c.name INTO v_name
  FROM public.categories c
  WHERE c.id = p_category_id AND c.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE public.transactions t
  SET category_id = c_other
  WHERE t.user_id = p_user_id AND t.category_id = p_category_id;

  UPDATE public.receipts r
  SET raw_response = jsonb_set(
        r.raw_response, '{items}',
        public.receipt_items_rename_category(r.raw_response -> 'items', v_name, 'Other'))
  WHERE r.user_id = p_user_id
    AND jsonb_typeof(r.raw_response -> 'items') = 'array'
    AND public.receipt_items_rename_category(r.raw_response -> 'items', v_name, 'Other')
        IS DISTINCT FROM r.raw_response -> 'items';

  DELETE FROM public.budgets b
  WHERE b.user_id = p_user_id AND b.category_id = p_category_id;

  DELETE FROM public.categories c
  WHERE c.id = p_category_id AND c.user_id = p_user_id;

  RETURN TRUE;
END;
$$;

-- ------------------------------------------------------------------ GRANTs
-- Supabase grants EXECUTE on new public functions to anon/authenticated by
-- default (and PostgREST exposes them as /rpc/*): revoke explicitly.
REVOKE ALL ON FUNCTION public.receipt_items_rename_category(JSONB, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.categories_after_rename() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_custom_category(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receipt_items_rename_category(JSONB, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_custom_category(UUID, UUID) TO service_role;
