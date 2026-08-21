-- Audit trail for sensitive admin actions (grant/revoke admin, suspend,
-- delete-all-data, ...). Only the backend (service-role client) ever
-- touches this table, so RLS is enabled with no policies — deny-all for
-- anon/authenticated roles, service role bypasses regardless (matches the
-- rest of the project's "RLS enabled on all tables" convention).
--
-- target_user_id uses ON DELETE SET NULL (not CASCADE): when an admin
-- deletes a user's data, we want the audit record of that deletion to
-- survive the user being gone. The target's email at the time of the
-- action is captured in `details` so the record stays meaningful.
CREATE TABLE public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_log_admin_id_idx ON public.admin_audit_log(admin_id);
CREATE INDEX admin_audit_log_target_user_id_idx ON public.admin_audit_log(target_user_id);
CREATE INDEX admin_audit_log_created_at_idx ON public.admin_audit_log(created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
