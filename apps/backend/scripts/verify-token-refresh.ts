/**
 * Standalone verification script — not part of the Jest suite.
 *
 * Confirms POST /api/v1/auth/refresh against the real Supabase project:
 * login, refresh using the returned refresh_token, and confirm the new
 * access_token actually authenticates a real request. Cleans up after.
 */
process.env.NODE_ENV = 'test';

import 'dotenv/config';
import request from 'supertest';
import { supabase } from '@smartbudget/shared/lib/supabase';

async function main() {
  const { app } = await import('../src/index');

  const email = `verify-token-refresh-${Date.now()}@example.com`;
  const password = 'VerifyTokenRefresh123';
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
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password });
    if (loginRes.status !== 200) {
      console.error('FAIL: login failed:', loginRes.status, loginRes.body);
      process.exit(1);
    }
    const { access_token: firstAccessToken, refresh_token: firstRefreshToken } = loginRes.body.session;
    console.log('PASS: logged in, got initial session');

    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: firstRefreshToken });

    if (refreshRes.status !== 200) {
      failures.push(`refresh returned ${refreshRes.status}: ${JSON.stringify(refreshRes.body)}`);
    } else if (refreshRes.body.session.access_token === firstAccessToken) {
      failures.push('refreshed access_token is identical to the original — refresh may not be working');
    } else {
      console.log('PASS: refresh returned a new access_token');
    }

    if (refreshRes.status === 200) {
      const newAccessToken = refreshRes.body.session.access_token;
      const receiptsRes = await request(app)
        .get('/api/v1/receipts')
        .set('Authorization', `Bearer ${newAccessToken}`);
      if (receiptsRes.status !== 200) {
        failures.push(`new access_token failed to authenticate a real request: ${receiptsRes.status}`);
      } else {
        console.log('PASS: new access_token authenticates a real request');
      }
    }

    const badRefreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: 'not-a-real-refresh-token' });
    if (badRefreshRes.status !== 401) {
      failures.push(`invalid refresh_token should return 401, got ${badRefreshRes.status}`);
    } else {
      console.log('PASS: an invalid refresh_token is rejected with 401');
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
