/**
 * Standalone verification script — not part of the Jest suite.
 *
 * Confirms the admin user-list endpoint against the real Supabase project:
 * a non-admin caller gets 403, and after flipping profiles.is_admin the
 * same caller can list users. Cleans up the test user afterward.
 */
process.env.NODE_ENV = 'test';

import 'dotenv/config';
import request from 'supertest';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { supabaseAuth } from '@smartbudget/shared/lib/supabaseAuth';

async function main() {
  const { app } = await import('../src/index');

  const email = `verify-admin-users-${Date.now()}@example.com`;
  const password = 'VerifyAdminUsers123';
  const failures: string[] = [];

  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userError || !userData.user) {
    console.error('FAIL: could not create test user:', userError?.message);
    process.exit(1);
  }
  const userId = userData.user.id;

  try {
    const { data: signIn, error: signInError } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (signInError || !signIn.session) {
      console.error('FAIL: could not sign in test user:', signInError?.message);
      process.exit(1);
    }
    const token = signIn.session.access_token;

    const beforeRes = await request(app).get('/api/v1/admin/users').set('Authorization', `Bearer ${token}`);
    if (beforeRes.status !== 403) {
      failures.push(`non-admin should get 403, got ${beforeRes.status}: ${JSON.stringify(beforeRes.body)}`);
    } else {
      console.log('PASS: non-admin caller gets 403');
    }

    const { error: updateError } = await supabase.from('profiles').update({ is_admin: true }).eq('id', userId);
    if (updateError) {
      console.error('FAIL: could not grant admin:', updateError.message);
      process.exit(1);
    }

    const afterRes = await request(app).get('/api/v1/admin/users').set('Authorization', `Bearer ${token}`);
    if (afterRes.status !== 200) {
      failures.push(`admin should get 200, got ${afterRes.status}: ${JSON.stringify(afterRes.body)}`);
    } else if (!Array.isArray(afterRes.body.users) || afterRes.body.users.length === 0) {
      failures.push('admin user list is empty or malformed');
    } else {
      console.log(`PASS: admin caller lists ${afterRes.body.users.length} user(s)`);
    }
  } finally {
    await supabase.auth.admin.deleteUser(userId);
    console.log('Cleaned up test user.');
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
