/**
 * Standalone verification script — not part of the Jest suite.
 *
 * Confirms GET /api/v1/admin/users/:id/export against the real Supabase
 * project: real profile/receipt/budget data comes back, and the export
 * itself is audit-logged.
 */
process.env.NODE_ENV = 'test';

import 'dotenv/config';
import request from 'supertest';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { supabaseAuth } from '@smartbudget/shared/lib/supabaseAuth';

async function main() {
  const { app } = await import('../src/index');
  const failures: string[] = [];

  const adminEmail = `verify-export-caller-${Date.now()}@example.com`;
  const targetEmail = `verify-export-target-${Date.now()}@example.com`;
  const password = 'VerifyExport123';

  const { data: adminData } = await supabase.auth.admin.createUser({ email: adminEmail, password, email_confirm: true });
  const { data: targetData } = await supabase.auth.admin.createUser({ email: targetEmail, password, email_confirm: true });
  const adminId = adminData!.user!.id;
  const targetId = targetData!.user!.id;

  try {
    await supabase.from('profiles').update({ is_admin: true }).eq('id', adminId);
    await supabase.from('receipts').insert({
      user_id: targetId,
      raw_response: { merchant: 'Export Test Store', total: 33, date: '2026-01-01', items: [] },
    });
    await supabase.from('budgets').insert({ user_id: targetId, category: 'Dining', monthly_limit: 200 });

    const { data: signIn } = await supabaseAuth.auth.signInWithPassword({ email: adminEmail, password });
    const token = signIn!.session!.access_token;

    const exportRes = await request(app)
      .get(`/api/v1/admin/users/${targetId}/export`)
      .set('Authorization', `Bearer ${token}`);

    if (exportRes.status !== 200) {
      failures.push(`export returned ${exportRes.status}: ${JSON.stringify(exportRes.body)}`);
    } else if (exportRes.body.profile.email !== targetEmail) {
      failures.push(`profile email mismatch: ${exportRes.body.profile.email}`);
    } else if (exportRes.body.receipts.length !== 1 || exportRes.body.budgets.length !== 1) {
      failures.push(`expected 1 receipt + 1 budget, got ${exportRes.body.receipts.length} + ${exportRes.body.budgets.length}`);
    } else {
      console.log('PASS: export returns real profile, receipt, and budget data:', {
        profile: exportRes.body.profile,
        receiptCount: exportRes.body.receipts.length,
        budgetCount: exportRes.body.budgets.length,
      });
    }

    const { data: auditRow } = await supabase
      .from('admin_audit_log')
      .select('*')
      .eq('admin_id', adminId)
      .eq('action', 'export_user_data')
      .maybeSingle();
    if (!auditRow) failures.push('no export_user_data audit row found');
    else console.log('PASS: export is audit-logged');
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
