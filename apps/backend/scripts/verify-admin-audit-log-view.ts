/**
 * Standalone verification script — not part of the Jest suite.
 *
 * Confirms GET /api/v1/admin/audit-log against the real Supabase project:
 * an admin action (grant) shows up enriched with the acting admin's real
 * email, and target details survive.
 */
process.env.NODE_ENV = 'test';

import 'dotenv/config';
import request from 'supertest';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { supabaseAuth } from '@smartbudget/shared/lib/supabaseAuth';

async function main() {
  const { app } = await import('../src/index');
  const failures: string[] = [];

  const adminEmail = `verify-audit-view-caller-${Date.now()}@example.com`;
  const targetEmail = `verify-audit-view-target-${Date.now()}@example.com`;
  const password = 'VerifyAuditView123';

  const { data: adminData } = await supabase.auth.admin.createUser({ email: adminEmail, password, email_confirm: true });
  const { data: targetData } = await supabase.auth.admin.createUser({ email: targetEmail, password, email_confirm: true });
  const adminId = adminData!.user!.id;
  const targetId = targetData!.user!.id;

  try {
    await supabase.from('profiles').update({ is_admin: true }).eq('id', adminId);
    const { data: signIn } = await supabaseAuth.auth.signInWithPassword({ email: adminEmail, password });
    const token = signIn!.session!.access_token;

    // Perform a real, audit-logged action.
    const grantRes = await request(app)
      .post(`/api/v1/admin/users/${targetId}/admin`)
      .set('Authorization', `Bearer ${token}`);
    if (grantRes.status !== 200) {
      console.error('FAIL: setup grant failed:', grantRes.status, grantRes.body);
      process.exit(1);
    }

    const auditRes = await request(app).get('/api/v1/admin/audit-log').set('Authorization', `Bearer ${token}`);
    if (auditRes.status !== 200) {
      failures.push(`audit-log returned ${auditRes.status}: ${JSON.stringify(auditRes.body)}`);
    } else {
      const entry = (auditRes.body.auditLog as any[]).find(
        (e) => e.action === 'grant_admin' && e.target_user_id === targetId
      );
      if (!entry) {
        failures.push('grant_admin entry for this target not found in audit log');
      } else if (entry.admin_email !== adminEmail) {
        failures.push(`expected admin_email ${adminEmail}, got ${entry.admin_email}`);
      } else if (entry.details?.email !== targetEmail) {
        failures.push(`expected details.email ${targetEmail}, got ${entry.details?.email}`);
      } else {
        console.log('PASS: audit log entry enriched with real admin email and correct target details:', entry);
      }
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
