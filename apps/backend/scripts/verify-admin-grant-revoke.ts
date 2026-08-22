/**
 * Standalone verification script — not part of the Jest suite.
 *
 * Confirms POST/DELETE /api/v1/admin/users/:id/admin against the real
 * Supabase project: grant, revoke, self-revoke guard, and that both
 * actions actually write to admin_audit_log.
 */
process.env.NODE_ENV = 'test';

import 'dotenv/config';
import request from 'supertest';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { supabaseAuth } from '@smartbudget/shared/lib/supabaseAuth';

async function main() {
  const { app } = await import('../src/index');
  const failures: string[] = [];

  const adminEmail = `verify-grant-revoke-caller-${Date.now()}@example.com`;
  const targetEmail = `verify-grant-revoke-target-${Date.now()}@example.com`;
  const password = 'VerifyGrantRevoke123';

  const { data: adminData } = await supabase.auth.admin.createUser({ email: adminEmail, password, email_confirm: true });
  const { data: targetData } = await supabase.auth.admin.createUser({ email: targetEmail, password, email_confirm: true });
  const adminId = adminData!.user!.id;
  const targetId = targetData!.user!.id;

  try {
    await supabase.from('profiles').update({ is_admin: true }).eq('id', adminId);
    const { data: signIn } = await supabaseAuth.auth.signInWithPassword({ email: adminEmail, password });
    const token = signIn!.session!.access_token;

    const grantRes = await request(app)
      .post(`/api/v1/admin/users/${targetId}/admin`)
      .set('Authorization', `Bearer ${token}`);
    if (grantRes.status !== 200) failures.push(`grant returned ${grantRes.status}: ${JSON.stringify(grantRes.body)}`);

    const { data: afterGrant } = await supabase.from('profiles').select('is_admin').eq('id', targetId).single();
    if (!afterGrant?.is_admin) failures.push('target is not is_admin=true after grant');
    else console.log('PASS: grant sets is_admin=true');

    const selfRevokeRes = await request(app)
      .delete(`/api/v1/admin/users/${adminId}/admin`)
      .set('Authorization', `Bearer ${token}`);
    if (selfRevokeRes.status !== 400) failures.push(`self-revoke should be 400, got ${selfRevokeRes.status}`);
    else console.log('PASS: self-revoke is rejected with 400');

    const revokeRes = await request(app)
      .delete(`/api/v1/admin/users/${targetId}/admin`)
      .set('Authorization', `Bearer ${token}`);
    if (revokeRes.status !== 200) failures.push(`revoke returned ${revokeRes.status}: ${JSON.stringify(revokeRes.body)}`);

    const { data: afterRevoke } = await supabase.from('profiles').select('is_admin').eq('id', targetId).single();
    if (afterRevoke?.is_admin) failures.push('target still is_admin=true after revoke');
    else console.log('PASS: revoke sets is_admin=false');

    const { data: auditRows } = await supabase
      .from('admin_audit_log')
      .select('action, target_user_id')
      .eq('admin_id', adminId)
      .in('action', ['grant_admin', 'revoke_admin']);
    const actions = (auditRows ?? []).map((r) => r.action).sort();
    if (JSON.stringify(actions) !== JSON.stringify(['grant_admin', 'revoke_admin'])) {
      failures.push(`expected [grant_admin, revoke_admin] audit rows, got ${JSON.stringify(actions)}`);
    } else {
      console.log('PASS: both actions were written to admin_audit_log');
    }
  } finally {
    await supabase.auth.admin.deleteUser(targetId);
    await supabase.auth.admin.deleteUser(adminId);
    console.log('Cleaned up test users.');
  }

  if (failures.length > 0) {
    console.error('FAIL:', failures);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FAIL: unexpected error:', err);
  process.exit(1);
});
