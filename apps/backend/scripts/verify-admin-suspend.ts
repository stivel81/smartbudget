/**
 * Standalone verification script — not part of the Jest suite.
 *
 * The important claim to prove here isn't "our DB call succeeded" — it's
 * that Supabase actually refuses to authenticate a suspended user. Confirms
 * against the real Supabase project: suspend blocks login, unsuspend
 * restores it, self-suspend is rejected, and both actions are audit-logged.
 */
process.env.NODE_ENV = 'test';

import 'dotenv/config';
import request from 'supertest';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { supabaseAuth } from '@smartbudget/shared/lib/supabaseAuth';

async function main() {
  const { app } = await import('../src/index');
  const failures: string[] = [];

  const adminEmail = `verify-suspend-caller-${Date.now()}@example.com`;
  const targetEmail = `verify-suspend-target-${Date.now()}@example.com`;
  const password = 'VerifySuspend123';

  const { data: adminData } = await supabase.auth.admin.createUser({ email: adminEmail, password, email_confirm: true });
  const { data: targetData } = await supabase.auth.admin.createUser({ email: targetEmail, password, email_confirm: true });
  const adminId = adminData!.user!.id;
  const targetId = targetData!.user!.id;

  try {
    await supabase.from('profiles').update({ is_admin: true }).eq('id', adminId);
    const { data: signIn } = await supabaseAuth.auth.signInWithPassword({ email: adminEmail, password });
    const token = signIn!.session!.access_token;

    const preLoginRes = await request(app).post('/api/v1/auth/login').send({ email: targetEmail, password });
    if (preLoginRes.status !== 200) failures.push(`target should be able to log in before suspension, got ${preLoginRes.status}`);
    else console.log('PASS: target can log in before suspension');

    const suspendRes = await request(app)
      .post(`/api/v1/admin/users/${targetId}/suspend`)
      .set('Authorization', `Bearer ${token}`);
    if (suspendRes.status !== 200) failures.push(`suspend returned ${suspendRes.status}: ${JSON.stringify(suspendRes.body)}`);

    const suspendedLoginRes = await request(app).post('/api/v1/auth/login').send({ email: targetEmail, password });
    if (suspendedLoginRes.status === 200) {
      failures.push('FAIL — suspended user could still log in! Ban is not actually being enforced by Supabase.');
    } else if (suspendedLoginRes.status !== 403 || !/suspended/i.test(suspendedLoginRes.body.error || '')) {
      failures.push(`expected 403 "suspended" message, got ${suspendedLoginRes.status}: ${JSON.stringify(suspendedLoginRes.body)}`);
    } else {
      console.log(`PASS: suspended user's login is rejected with a clear message:`, suspendedLoginRes.body.error);
    }

    const selfSuspendRes = await request(app)
      .post(`/api/v1/admin/users/${adminId}/suspend`)
      .set('Authorization', `Bearer ${token}`);
    if (selfSuspendRes.status !== 400) failures.push(`self-suspend should be 400, got ${selfSuspendRes.status}`);
    else console.log('PASS: self-suspend is rejected with 400');

    const unsuspendRes = await request(app)
      .post(`/api/v1/admin/users/${targetId}/unsuspend`)
      .set('Authorization', `Bearer ${token}`);
    if (unsuspendRes.status !== 200) failures.push(`unsuspend returned ${unsuspendRes.status}: ${JSON.stringify(unsuspendRes.body)}`);

    const postUnsuspendLoginRes = await request(app).post('/api/v1/auth/login').send({ email: targetEmail, password });
    if (postUnsuspendLoginRes.status !== 200) {
      failures.push(`target should be able to log in again after unsuspend, got ${postUnsuspendLoginRes.status}`);
    } else {
      console.log('PASS: target can log in again after unsuspend');
    }

    const { data: auditRows } = await supabase
      .from('admin_audit_log')
      .select('action')
      .eq('admin_id', adminId)
      .in('action', ['suspend_user', 'unsuspend_user']);
    const actions = (auditRows ?? []).map((r) => r.action).sort();
    if (JSON.stringify(actions) !== JSON.stringify(['suspend_user', 'unsuspend_user'])) {
      failures.push(`expected [suspend_user, unsuspend_user] audit rows, got ${JSON.stringify(actions)}`);
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
