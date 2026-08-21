/**
 * Standalone verification script — not part of the Jest suite.
 *
 * Sends a real (deliberately corrupt) image to the real Claude API to
 * trigger a genuine scan failure, then confirms it's logged and visible
 * via GET /api/v1/admin/failed-scans. Costs a small amount of real API
 * usage (Claude still processes the request before rejecting it) — run
 * manually, not part of CI.
 */
process.env.NODE_ENV = 'test';

import 'dotenv/config';
import request from 'supertest';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { supabaseAuth } from '@smartbudget/shared/lib/supabaseAuth';

async function main() {
  const { app } = await import('../src/index');
  const failures: string[] = [];

  const email = `verify-failed-scans-${Date.now()}@example.com`;
  const password = 'VerifyFailedScans123';
  const { data: userData } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  const userId = userData!.user!.id;

  try {
    await supabase.from('profiles').update({ is_admin: true }).eq('id', userId);
    const { data: signIn } = await supabaseAuth.auth.signInWithPassword({ email, password });
    const token = signIn!.session!.access_token;

    console.log('Sending a deliberately corrupt image to the real Claude API...');
    const scanRes = await request(app)
      .post('/api/v1/receipts/scan')
      .set('Authorization', `Bearer ${token}`)
      .send({ image: Buffer.from('not a real jpeg').toString('base64'), mediaType: 'image/jpeg' });

    if (scanRes.status !== 500) {
      failures.push(`expected the corrupt-image scan to fail with 500, got ${scanRes.status}: ${JSON.stringify(scanRes.body)}`);
    } else {
      console.log('PASS: the corrupt image was genuinely rejected by Claude (500)');
    }

    const failedScansRes = await request(app)
      .get('/api/v1/admin/failed-scans')
      .set('Authorization', `Bearer ${token}`);

    const match = (failedScansRes.body.failures ?? []).find((f: any) => f.user_id === userId);
    if (failedScansRes.status !== 200 || !match) {
      failures.push(`expected a failed-scans row for this user, got: ${JSON.stringify(failedScansRes.body)}`);
    } else {
      console.log('PASS: the failure is visible via GET /api/v1/admin/failed-scans:', match);
    }
  } finally {
    await supabase.from('scan_failures').delete().eq('user_id', userId);
    await supabase.auth.admin.deleteUser(userId);
    console.log('Cleaned up test user and failure row.');
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
