import { supabase } from '@smartbudget/shared/lib/supabase';

export type AdminAction =
  | 'grant_admin'
  | 'revoke_admin'
  | 'suspend_user'
  | 'unsuspend_user'
  | 'delete_user_data'
  | 'export_user_data';

// Best-effort: a logging failure shouldn't block the admin action itself,
// but it's surfaced loudly since a missing audit record for a sensitive
// action (delete/suspend/grant) is itself a problem worth noticing.
export async function logAdminAction(
  adminId: string,
  action: AdminAction,
  targetUserId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from('admin_audit_log').insert({
    admin_id: adminId,
    action,
    target_user_id: targetUserId ?? null,
    details: details ?? null,
  });

  if (error) {
    console.error(`Failed to write audit log for action "${action}":`, error);
  }
}
