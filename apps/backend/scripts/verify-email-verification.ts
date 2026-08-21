/**
 * Standalone verification script — not part of the Jest suite.
 *
 * Confirms real email-verification signup behavior against the real
 * Supabase project: signup creates an unconfirmed account (no session),
 * and an immediate login attempt is rejected with the "verify your
 * email" message rather than silently succeeding. Cleans up the test
 * user afterward. Does not attempt to click the confirmation link.
 */
process.env.NODE_ENV = 'test';

import 'dotenv/config';
import request from 'supertest';
import { supabase } from '@smartbudget/shared/lib/supabase';

async function main() {
  const { app } = await import('../src/index');

  // Supabase's signUp() (unlike admin.createUser) validates the domain has
  // MX records, so reserved/documentation domains like example.com/.org
  // are rejected — use a real mail domain for this one-off manual check.
  const email = `smartbudget-verify-email-confirm-${Date.now()}@gmail.com`;
  const password = 'VerifyEmailConfirm123';

  const failures: string[] = [];

  const signupRes = await request(app)
    .post('/api/v1/auth/signup')
    .send({ email, password, name: 'Verify Flow' });

  if (signupRes.status !== 201) failures.push(`signup returned ${signupRes.status}: ${JSON.stringify(signupRes.body)}`);
  if (!signupRes.body.user?.id) failures.push('signup response has no user.id');

  if (failures.length > 0) {
    console.error('FAIL:', failures);
    process.exit(1);
  }
  console.log('PASS: signup created a pending account:', signupRes.body.user);

  const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password });

  if (loginRes.status !== 401) {
    failures.push(`login before confirmation should be 401, got ${loginRes.status}: ${JSON.stringify(loginRes.body)}`);
  } else if (!/verify your email/i.test(loginRes.body.error || '')) {
    failures.push(`login error message doesn't mention email verification: ${loginRes.body.error}`);
  }

  if (failures.length > 0) {
    console.error('FAIL:', failures);
  } else {
    console.log('PASS: login before email confirmation is rejected with a clear message:', loginRes.body.error);
  }

  // Cleanup — find and delete the test user via the admin API.
  const { data: usersPage } = await supabase.auth.admin.listUsers();
  const testUser = usersPage?.users.find((u) => u.email === email);
  if (testUser) {
    await supabase.auth.admin.deleteUser(testUser.id);
    console.log('Cleaned up test user.');
  }

  if (failures.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error('FAIL: unexpected error:', err);
  process.exit(1);
});
