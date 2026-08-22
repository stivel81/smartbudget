/**
 * Standalone verification script — not part of the Jest suite.
 *
 * The claim that matters here: DELETE /api/v1/admin/users/:id against the
 * real Supabase project actually erases everything — receipt row, budget
 * row, stored image in Storage, profile row, and the auth user itself (so
 * they can no longer log in) — not just "the request returned 200".
 */
process.env.NODE_ENV = 'test';

import 'dotenv/config';
import request from 'supertest';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { supabaseAuth } from '@smartbudget/shared/lib/supabaseAuth';

async function main() {
  const { app } = await import('../src/index');
  const failures: string[] = [];

  const adminEmail = `verify-delete-user-caller-${Date.now()}@example.com`;
  const targetEmail = `verify-delete-user-target-${Date.now()}@example.com`;
  const password = 'VerifyDeleteUser123';

  const { data: adminData } = await supabase.auth.admin.createUser({ email: adminEmail, password, email_confirm: true });
  const { data: targetData } = await supabase.auth.admin.createUser({ email: targetEmail, password, email_confirm: true });
  const adminId = adminData!.user!.id;
  const targetId = targetData!.user!.id;

  await supabase.from('profiles').update({ is_admin: true }).eq('id', adminId);

  const imagePath = `${targetId}/verify-delete.jpg`;
  const { data: receiptRow } = await supabase
    .from('receipts')
    .insert({
      user_id: targetId,
      raw_response: { merchant: 'Delete Me Store', total: 15, date: '2026-01-01', items: [] },
      image_path: imagePath,
    })
    .select()
    .single();
  await supabase.storage.from('receipts').upload(imagePath, Buffer.from('fake-image-bytes'), {
    contentType: 'image/jpeg',
    upsert: true,
  });
  await supabase.from('budgets').insert({ user_id: targetId, category: 'Groceries', monthly_limit: 500 });

  const { data: signIn } = await supabaseAuth.auth.signInWithPassword({ email: adminEmail, password });
  const token = signIn!.session!.access_token;

  try {
    const selfDeleteRes = await request(app)
      .delete(`/api/v1/admin/users/${adminId}`)
      .set('Authorization', `Bearer ${token}`);
    if (selfDeleteRes.status !== 400) failures.push(`self-delete should be 400, got ${selfDeleteRes.status}`);
    else console.log('PASS: self-delete is rejected with 400');

    const deleteRes = await request(app)
      .delete(`/api/v1/admin/users/${targetId}`)
      .set('Authorization', `Bearer ${token}`);
    if (deleteRes.status !== 200) failures.push(`delete returned ${deleteRes.status}: ${JSON.stringify(deleteRes.body)}`);
    else console.log('PASS: delete returned 200');

    // --- Verify everything is actually gone ---

    const { data: receiptAfter } = await supabase.from('receipts').select('*').eq('id', receiptRow!.id).maybeSingle();
    if (receiptAfter) failures.push('receipt row still exists after deletion');
    else console.log('PASS: receipt row is gone');

    const { data: budgetsAfter } = await supabase.from('budgets').select('*').eq('user_id', targetId);
    if (budgetsAfter && budgetsAfter.length > 0) failures.push('budget row still exists after deletion');
    else console.log('PASS: budget row is gone');

    const { data: profileAfter } = await supabase.from('profiles').select('*').eq('id', targetId).maybeSingle();
    if (profileAfter) failures.push('profile row still exists after deletion');
    else console.log('PASS: profile row is gone');

    const { data: listedFiles } = await supabase.storage.from('receipts').list(targetId);
    if (listedFiles && listedFiles.length > 0) {
      failures.push(`storage still has files for this user: ${JSON.stringify(listedFiles)}`);
    } else {
      console.log('PASS: stored receipt image is gone from Storage');
    }

    const { data: authAfter } = await supabase.auth.admin.getUserById(targetId);
    if (authAfter?.user) failures.push('auth user still exists after deletion');
    else console.log('PASS: auth user no longer exists');

    const loginAfterRes = await request(app).post('/api/v1/auth/login').send({ email: targetEmail, password });
    if (loginAfterRes.status === 200) failures.push('deleted user can still log in!');
    else console.log('PASS: deleted user can no longer log in');

    const { data: auditRow } = await supabase
      .from('admin_audit_log')
      .select('*')
      .eq('admin_id', adminId)
      .eq('action', 'delete_user_data')
      .single();
    if (!auditRow) {
      failures.push('no delete_user_data audit row found');
    } else if (auditRow.target_user_id !== null) {
      failures.push(`expected target_user_id to be nulled (target no longer exists), got ${auditRow.target_user_id}`);
    } else if (auditRow.details?.email !== targetEmail || auditRow.details?.imagesDeleted !== 1) {
      failures.push(`audit details incomplete: ${JSON.stringify(auditRow.details)}`);
    } else {
      console.log('PASS: audit log entry preserved with target_user_id nulled and details intact:', auditRow.details);
    }
  } finally {
    await supabase.auth.admin.deleteUser(adminId);
    console.log('Cleaned up admin user.');
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
