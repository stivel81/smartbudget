-- Admin-gating flag for the minimal admin dashboard (apps/admin).
-- No self-service way to become admin — grant manually via SQL/Studio:
--   update public.profiles set is_admin = true where email = '...';
ALTER TABLE public.profiles ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;
