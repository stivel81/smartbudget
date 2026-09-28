-- SECURITY: the "Users can update their own profile" RLS policy limits WHICH
-- row a user may update, not WHICH columns. Combined with the table-level
-- UPDATE grant Supabase gives `authenticated`, any signed-in user could call
-- PostgREST directly (the anon key ships in the mobile app) and run
--   PATCH /rest/v1/profiles?id=eq.<own id>  {"is_admin": true}
-- to grant themselves admin, or rewrite their `email` shown to admins.
--
-- Fix: replace the table-wide UPDATE privilege with a column-level one, so
-- clients can only change `name` (and `updated_at`). `is_admin`, `email`,
-- `id` and `created_at` are writable only by the service role (the backend:
-- admin grant/revoke routes and the handle_new_user trigger).

REVOKE UPDATE ON public.profiles FROM anon, authenticated;

GRANT UPDATE (name, updated_at) ON public.profiles TO authenticated;
