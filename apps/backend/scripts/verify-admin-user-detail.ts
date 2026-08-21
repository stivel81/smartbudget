/**
 * Standalone verification script — not part of the Jest suite.
 *
 * Confirms GET /api/v1/admin/users/:id and .../receipts against the real
 * Supabase project: creates a target user with a real receipt, grants a
 * separate caller admin, and checks the detail/stats/receipts responses.
 */
process.env.NODE_ENV = 'test';

import 'dotenv/config';
import request from 'supertest';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { supabaseAuth } from '@smartbudget/shared/lib/supabaseAuth';

async function main() {
  const { app } = await import('../src/index');
  const failures: string[] = [];

  const adminEmail = `verify-admin-detail-caller-${Date.now()}@example.com`;
  const targetEmail = `verify-admin-detail-target-${Date.now()}@example.com`;
  const password = 'VerifyAdminDetail123';

  const { data: adminData } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
  });
  const { data: targetData } = await supabase.auth.admin.createUser({
    email: targetEmail,
    password,
    email_confirm: true,
  });
  const adminId = adminData!.user!.id;
  const targetId = targetData!.user!.id;

  try {
    await supabase.from('profiles').update({ is_admin: true }).eq('id', adminId);

    await supabase.from('receipts').insert({
      user_id: targetId,
      raw_response: { merchant: 'Verify Store', total: 42.5, date: '2026-01-01', items: [] },
    });

    const { data: signIn } = await supabaseAuth.auth.signInWithPassword({ email: adminEmail, password });
    const token = signIn!.session!.access_token;

    const detailRes = await request(app)
      .get(`/api/v1/admin/users/${targetId}`)
      .set('Authorization', `Bearer ${token}`);

    if (detailRes.status !== 200) {
      failures.push(`detail returned ${detailRes.status}: ${JSON.stringify(detailRes.body)}`);
    } else if (detailRes.body.user.email !== targetEmail) {
      failures.push(`detail email mismatch: ${detailRes.body.user.email}`);
    } else if (detailRes.body.stats.receiptCount !== 1 || detailRes.body.stats.totalSpent !== 42.5) {
      failures.push(`detail stats wrong: ${JSON.stringify(detailRes.body.stats)}`);
    } else if (detailRes.body.user.email_confirmed_at == null) {
      failures.push('expected email_confirmed_at to be set (real confirmed user)');
    } else {
      console.log('PASS: user detail returns real profile + auth status + stats:', detailRes.body);
    }

    const receiptsRes = await request(app)
      .get(`/api/v1/admin/users/${targetId}/receipts`)
      .set('Authorization', `Bearer ${token}`);

    if (receiptsRes.status !== 200 || receiptsRes.body.receipts.length !== 1) {
      failures.push(`receipts list wrong: ${receiptsRes.status} ${JSON.stringify(receiptsRes.body)}`);
    } else {
      console.log('PASS: user receipts list returns the real receipt');
    }

    const notFoundRes = await request(app)
      .get('/api/v1/admin/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`);
    if (notFoundRes.status !== 404) {
      failures.push(`expected 404 for a nonexistent user, got ${notFoundRes.status}`);
    } else {
      console.log('PASS: a nonexistent user id returns 404');
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
