-- Spending categories.
--
-- BASE categories are shared rows with user_id NULL (the 6 names the app has
-- always used: RECEIPT_CATEGORIES in apps/backend/src/services/claude.ts).
-- They are read-only for every client. CUSTOM categories belong to one user
-- (user_id = that user) and only that user may create / rename / delete them.
--
-- Name rules (enforced HERE, not only in the API, because RLS lets a
-- signed-in client insert/rename its own rows straight through PostgREST
-- with the public anon key):
--   * 1-30 characters, no leading/trailing whitespace        (CHECK)
--   * base names unique, case-insensitive                    (partial unique index)
--   * a user's custom names unique per user, case-insensitive (partial unique index)
--   * a custom name may not equal a base name, case-insensitive (TRIGGER below;
--     a unique index can't span the NULL / non-NULL user_id partitions)
-- The API also checks the clash first so it can answer 409 with a clear
-- message; the trigger is the authoritative guard (raises SQLSTATE 23505).
--
-- Safe to re-run: IF NOT EXISTS / OR REPLACE / DROP ... IF EXISTS / ON CONFLICT.

CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL
    CONSTRAINT categories_name_format CHECK (char_length(name) BETWEEN 1 AND 30 AND name = btrim(name)),
  icon TEXT NULL
    CONSTRAINT categories_icon_length CHECK (icon IS NULL OR char_length(icon) BETWEEN 1 AND 64),
  color TEXT NULL
    CONSTRAINT categories_color_format CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  is_base BOOLEAN GENERATED ALWAYS AS (user_id IS NULL) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS categories_base_name_key
  ON public.categories (lower(name)) WHERE user_id IS NULL;

-- Also serves "all categories of user X" lookups (leading user_id column).
CREATE UNIQUE INDEX IF NOT EXISTS categories_user_name_key
  ON public.categories (user_id, lower(name)) WHERE user_id IS NOT NULL;

-- Name/ownership guard + updated_at maintenance.
-- SECURITY INVOKER (default): the base-name lookup only needs base rows,
-- which every authenticated user can SELECT.
CREATE OR REPLACE FUNCTION public.categories_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Ownership is immutable: a custom category can't become base (or move
    -- to another user) and a base one can't be claimed.
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'categories.user_id cannot be changed' USING ERRCODE = 'check_violation';
    END IF;
    NEW.updated_at := now();
  END IF;

  IF NEW.user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.user_id IS NULL AND lower(c.name) = lower(NEW.name)
  ) THEN
    RAISE EXCEPTION 'category name "%" is already used by a base category', NEW.name
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS categories_before_write ON public.categories;
CREATE TRIGGER categories_before_write
BEFORE INSERT OR UPDATE ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.categories_before_write();

-- Seed the 6 base categories with fixed ids (mirrored in
-- apps/backend/src/services/categories.ts as BASE_CATEGORY_IDS).
-- icon/color mirror CATEGORY_META in apps/mobile/lib/theme.ts.
INSERT INTO public.categories (id, user_id, name, icon, color) VALUES
  ('00000000-0000-4000-8000-000000000001', NULL, 'Groceries',     'cart',                  '#0F6E56'),
  ('00000000-0000-4000-8000-000000000002', NULL, 'Dining',        'silverware-fork-knife', '#D97706'),
  ('00000000-0000-4000-8000-000000000003', NULL, 'Transport',     'bus',                   '#4F46E5'),
  ('00000000-0000-4000-8000-000000000004', NULL, 'Entertainment', 'television',            '#DC2626'),
  ('00000000-0000-4000-8000-000000000005', NULL, 'Health',        'heart',                 '#16A34A'),
  ('00000000-0000-4000-8000-000000000006', NULL, 'Other',         'dots-horizontal',       '#6B7280')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- RLS
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select base and own categories" ON public.categories;
CREATE POLICY "Users can select base and own categories"
ON public.categories
FOR SELECT
TO authenticated
USING (user_id IS NULL OR user_id = auth.uid());

-- user_id = auth.uid() is never true for a base row (NULL), so none of the
-- write policies can ever touch a base category.
DROP POLICY IF EXISTS "Users can insert own custom categories" ON public.categories;
CREATE POLICY "Users can insert own custom categories"
ON public.categories
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own custom categories" ON public.categories;
CREATE POLICY "Users can update own custom categories"
ON public.categories
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own custom categories" ON public.categories;
CREATE POLICY "Users can delete own custom categories"
ON public.categories
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ---------------------------------------------------------------- GRANTs
-- Explicit, so the result is the same whether or not the project still
-- auto-grants new public tables to the API roles (see
-- auto_expose_new_tables in supabase/config.toml). Like migration
-- 20260928120000 for profiles: RLS limits WHICH rows, column grants limit
-- WHICH columns. Clients may only write name/icon/color (and user_id on
-- insert, which the policy pins to auth.uid()); id, is_base, created_at and
-- updated_at are server-controlled.
REVOKE ALL ON public.categories FROM anon, authenticated;
GRANT SELECT, DELETE ON public.categories TO authenticated;
GRANT INSERT (user_id, name, icon, color) ON public.categories TO authenticated;
GRANT UPDATE (name, icon, color) ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;

REVOKE ALL ON FUNCTION public.categories_before_write() FROM PUBLIC, anon, authenticated;
