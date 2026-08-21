/**
 * Standalone verification script — not part of the Jest suite.
 *
 * Actually triggers the real rate limiter (NODE_ENV must NOT be 'test',
 * unlike every other verify script here) against the real Supabase
 * project, and confirms a real row lands in rate_limit_violations.
 */
import 'dotenv/config';
import request from 'supertest';
import { supabase } from '@smartbudget/shared/lib/supabase';

async function main() {
  const { app } = await import('../src/index');
  const failures: string[] = [];

  const before = new Date().toISOString();

  console.log('Sending 11 rapid login attempts to trigger the real auth rate limit...');
  let lastStatus = 0;
  for (let i = 0; i < 11; i++) {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'rate-limit-check@example.com', password: 'wrong-password' });
    lastStatus = res.status;
  }

  if (lastStatus !== 429) {
    failures.push(`expected the 11th rapid login to be rate-limited (429), got ${lastStatus}`);
  } else {
    console.log('PASS: the 11th rapid login attempt was rate-limited');
  }

  // Give the fire-and-forget insert inside the handler a moment to land.
  await new Promise((r) => setTimeout(r, 500));

  const { data: rows, error } = await supabase
    .from('rate_limit_violations')
    .select('*')
    .gte('created_at', before)
    .eq('route', '/api/v1/auth/login')
    .order('created_at', { ascending: false });

  if (error) {
    failures.push(`could not query rate_limit_violations: ${error.message}`);
  } else if (!rows || rows.length === 0) {
    failures.push('no rate_limit_violations row was written for this run');
  } else {
    console.log(`PASS: ${rows.length} real violation row(s) written:`, rows[0]);
    // Clean up the rows this run created.
    await supabase.from('rate_limit_violations').delete().gte('created_at', before);
    console.log('Cleaned up test violation rows.');
  }

  if (failures.length > 0) {
    console.error('FAIL:', failures);
    process.exit(1);
  }

  // Unlike every other verify script, this one runs with NODE_ENV !== 'test'
  // so the real rate limiter is active — which also means index.ts called
  // app.listen(), so the process would otherwise hang here forever.
  process.exit(0);
}

main().catch((err) => {
  console.error('FAIL: unexpected error:', err);
  process.exit(1);
});
