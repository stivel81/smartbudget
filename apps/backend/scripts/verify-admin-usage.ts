/**
 * Standalone verification script — not part of the Jest suite.
 *
 * Sends a real receipt through the real Claude API (so real usage numbers
 * exist), then confirms GET /api/v1/admin/usage aggregates them correctly.
 * Costs real Claude tokens — run manually, not part of CI.
 */
process.env.NODE_ENV = 'test';

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { supabaseAuth } from '@smartbudget/shared/lib/supabaseAuth';

const FIXTURE_DIR = path.join(__dirname, '..', '..', '..', 'test', 'impl');

function findFixtureImage(): string | null {
  if (!fs.existsSync(FIXTURE_DIR)) return null;
  const file = fs.readdirSync(FIXTURE_DIR).find((f) => /\.(jpe?g|png)$/i.test(f));
  return file ? path.join(FIXTURE_DIR, file) : null;
}

async function main() {
  const imagePath = findFixtureImage();
  if (!imagePath) {
    console.log(`No test image found in ${FIXTURE_DIR} — skipping.`);
    process.exit(0);
  }

  const { app } = await import('../src/index');
  const failures: string[] = [];

  const adminEmail = `verify-usage-caller-${Date.now()}@example.com`;
  const password = 'VerifyUsage123';
  const { data: adminData } = await supabase.auth.admin.createUser({ email: adminEmail, password, email_confirm: true });
  const adminId = adminData!.user!.id;

  try {
    await supabase.from('profiles').update({ is_admin: true }).eq('id', adminId);
    const { data: signIn } = await supabaseAuth.auth.signInWithPassword({ email: adminEmail, password });
    const token = signIn!.session!.access_token;

    const mediaType = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const base64 = fs.readFileSync(imagePath).toString('base64');

    console.log('Scanning a real receipt via Claude...');
    const scanRes = await request(app)
      .post('/api/v1/receipts/scan')
      .set('Authorization', `Bearer ${token}`)
      .send({ image: base64, mediaType });

    if (scanRes.status !== 201) {
      console.error('FAIL: scan failed:', scanRes.status, scanRes.body);
      process.exit(1);
    }
    const receiptId = scanRes.body.receipt.id;
    const persistedUsage = scanRes.body.receipt.claude_usage;
    if (!persistedUsage || typeof persistedUsage.input_tokens !== 'number') {
      failures.push(`receipt was not saved with real claude_usage: ${JSON.stringify(persistedUsage)}`);
    } else {
      console.log('PASS: real scan persisted real token usage:', persistedUsage);
    }

    const usageRes = await request(app).get('/api/v1/admin/usage').set('Authorization', `Bearer ${token}`);
    if (usageRes.status !== 200) {
      failures.push(`usage endpoint returned ${usageRes.status}: ${JSON.stringify(usageRes.body)}`);
    } else if (usageRes.body.totalScans < 1 || usageRes.body.totalInputTokens < persistedUsage.input_tokens) {
      failures.push(`usage aggregation looks wrong: ${JSON.stringify(usageRes.body)}`);
    } else {
      console.log('PASS: usage endpoint reflects the real scan:', {
        totalScans: usageRes.body.totalScans,
        totalInputTokens: usageRes.body.totalInputTokens,
        totalOutputTokens: usageRes.body.totalOutputTokens,
        estimatedCostUsd: usageRes.body.estimatedCostUsd,
        days: usageRes.body.byDay.length,
      });
    }

    await supabase.from('receipts').delete().eq('id', receiptId);
    console.log('Cleaned up the test receipt.');
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
