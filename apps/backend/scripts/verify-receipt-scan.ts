/**
 * Standalone verification script — not part of the Jest suite.
 *
 * Sends a real receipt photo through the real Claude Haiku 4.5 API and
 * confirms the result gets persisted to Supabase. Requires a real
 * ANTHROPIC_API_KEY and costs real API tokens, so it's run manually
 * (`npm run verify:receipt-scan`), not on every test run.
 *
 * Looks for a receipt photo at test/impl/*.jpg at the repo root (gitignored,
 * personal fixture) — drop one there to run this. Creates a throwaway auth
 * user, scans the receipt, verifies the row, then deletes the user (which
 * cascades to the receipt) so it doesn't leave data behind.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { scanReceipt } from '../src/services/claude';

const FIXTURE_DIR = path.join(__dirname, '..', '..', '..', 'test', 'impl');

function findFixtureImage(): string | null {
  if (!fs.existsSync(FIXTURE_DIR)) return null;
  const file = fs
    .readdirSync(FIXTURE_DIR)
    .find((f) => /\.(jpe?g|png)$/i.test(f));
  return file ? path.join(FIXTURE_DIR, file) : null;
}

async function main() {
  const imagePath = findFixtureImage();
  if (!imagePath) {
    console.log(
      `No test image found in ${FIXTURE_DIR} — drop a receipt photo (.jpg/.png) there to run this check. Skipping.`
    );
    process.exit(0);
  }

  console.log(`Using fixture: ${imagePath}`);
  const mediaType = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  const base64 = fs.readFileSync(imagePath).toString('base64');

  const email = `verify-receipt-scan-${Date.now()}@example.com`;
  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
    email,
    password: 'VerifyReceiptScan123',
    email_confirm: true,
  });
  if (userError || !userData.user) {
    console.error('FAIL: could not create test user:', userError?.message);
    process.exit(1);
  }
  const userId = userData.user.id;

  try {
    console.log('Sending image to Claude Haiku 4.5...');
    const extraction = await scanReceipt(base64, mediaType);
    console.log('Extraction:', JSON.stringify(extraction, null, 2));

    const failures: string[] = [];
    if (!extraction.merchant) failures.push('merchant is empty');
    if (!extraction.date) failures.push('date is empty');
    if (!(extraction.total > 0)) failures.push('total is not a positive number');
    if (!Array.isArray(extraction.items) || extraction.items.length === 0) {
      failures.push('items array is empty');
    }

    if (failures.length > 0) {
      console.error('FAIL: extraction did not meet expectations:', failures);
      process.exit(1);
    }

    const { data: receipt, error: insertError } = await supabase
      .from('receipts')
      .insert({ user_id: userId, raw_response: extraction })
      .select()
      .single();

    if (insertError || !receipt) {
      console.error('FAIL: could not persist receipt:', insertError?.message);
      process.exit(1);
    }

    console.log(`PASS: receipt persisted as ${receipt.id}`);
  } finally {
    await supabase.auth.admin.deleteUser(userId);
    console.log('Cleaned up test user (receipt cascade-deleted).');
  }
}

main().catch((err) => {
  console.error('FAIL: unexpected error:', err);
  process.exit(1);
});
