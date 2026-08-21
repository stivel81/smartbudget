/**
 * Standalone verification script — not part of the Jest suite.
 *
 * Confirms logAdminAction actually writes to the real admin_audit_log
 * table and that ON DELETE SET NULL preserves the record when the
 * target user is later deleted.
 */
process.env.NODE_ENV = 'test';

import 'dotenv/config';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { logAdminAction } from '../src/services/auditLog';

async function createTestUser(label: string) {
  const email = `verify-audit-log-${label}-${Date.now()}@example.com`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: 'VerifyAuditLog123',
    email_confirm: true,
  });
  if (error || !data.user) {
    console.error(`FAIL: could not create ${label} user:`, error?.message);
    process.exit(1);
  }
  return { id: data.user!.id, email };
}

async function main() {
  const failures: string[] = [];

  // Two separate users so admin_id (ON DELETE CASCADE) and target_user_id
  // (ON DELETE SET NULL) can be tested independently — using one user as
  // both would mask target_user_id's behavior behind admin_id's cascade.
  const admin = await createTestUser('admin');
  const target = await createTestUser('target');

  await logAdminAction(admin.id, 'delete_user_data', target.id, {
    email: target.email,
    note: 'verification run',
  });

  const { data: rows, error: selectError } = await supabase
    .from('admin_audit_log')
    .select('*')
    .eq('admin_id', admin.id)
    .eq('action', 'delete_user_data');

  if (selectError || !rows || rows.length === 0) {
    failures.push(`expected an audit_log row, got: ${JSON.stringify({ selectError, rows })}`);
  } else {
    console.log('PASS: audit log row written:', rows[0]);
  }

  const rowId = rows?.[0]?.id;

  await supabase.auth.admin.deleteUser(target.id);
  console.log('Deleted target user (admin user still exists).');

  if (rowId) {
    const { data: afterDelete, error: afterDeleteError } = await supabase
      .from('admin_audit_log')
      .select('*')
      .eq('id', rowId)
      .single();

    if (afterDeleteError || !afterDelete) {
      failures.push('audit log row disappeared after the target user was deleted (should have survived via ON DELETE SET NULL)');
    } else if (afterDelete.target_user_id !== null) {
      failures.push(`expected target_user_id to be nulled after delete, got ${afterDelete.target_user_id}`);
    } else if (afterDelete.details?.email !== target.email) {
      failures.push('details.email should still capture who the target was, independent of the FK');
    } else {
      console.log('PASS: audit log row survived the target user deletion, target_user_id nulled, details.email preserved');
    }
  }

  await supabase.auth.admin.deleteUser(admin.id);
  console.log('Deleted admin user (cascades its own audit rows, including the one from this run).');

  if (failures.length > 0) {
    console.error('FAIL:', failures);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FAIL: unexpected error:', err);
  process.exit(1);
});
