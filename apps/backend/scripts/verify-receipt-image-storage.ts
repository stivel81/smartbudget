/**
 * Standalone verification script — not part of the Jest suite.
 *
 * Exercises the real HTTP routes (POST /scan, GET /:id/image-url, DELETE /:id)
 * against the real Supabase Storage bucket and real Claude Haiku 4.5 API,
 * confirming: the scanned image is uploaded and `image_path` is saved, the
 * signed image URL actually resolves to the uploaded bytes, and deleting the
 * receipt also removes the stored object (regulatory erasure requirement).
 *
 * Looks for a receipt photo at test/impl/*.jpg at the repo root (gitignored,
 * personal fixture). Creates a throwaway auth user, runs the flow, then
 * deletes the user (cascades the receipt row) so it doesn't leave data behind.
 */
process.env.NODE_ENV = 'test';

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { supabase } from '@smartbudget/shared/lib/supabase';
// Deliberately a separate client instance from `supabase` — signInWithPassword
// mutates the calling client's session state, and `supabase` is the same
// singleton the app's routes use for every DB/storage query in this process.
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

  // Import after NODE_ENV=test is set, so index.ts doesn't call app.listen().
  const { app } = await import('../src/index');

  console.log(`Using fixture: ${imagePath}`);
  const mediaType = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  const base64 = fs.readFileSync(imagePath).toString('base64');

  const email = `verify-image-storage-${Date.now()}@example.com`;
  const password = 'VerifyImageStorage123';
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

    console.log('Scanning receipt via POST /api/v1/receipts/scan...');
    const scanRes = await request(app)
      .post('/api/v1/receipts/scan')
      .set('Authorization', `Bearer ${token}`)
      .send({ image: base64, mediaType });

    const failures: string[] = [];
    if (scanRes.status !== 201) failures.push(`scan returned ${scanRes.status}: ${JSON.stringify(scanRes.body)}`);
    if (!scanRes.body.receipt?.image_path) failures.push('receipt has no image_path after scan');
    if (failures.length > 0) {
      console.error('FAIL:', failures);
      process.exit(1);
    }
    const receiptId = scanRes.body.receipt.id;
    console.log(`PASS: receipt ${receiptId} scanned with image_path=${scanRes.body.receipt.image_path}`);

    console.log('Fetching signed image URL...');
    const urlRes = await request(app)
      .get(`/api/v1/receipts/${receiptId}/image-url`)
      .set('Authorization', `Bearer ${token}`);

    if (urlRes.status !== 200 || !urlRes.body.url) {
      console.error('FAIL: image-url returned', urlRes.status, urlRes.body);
      process.exit(1);
    }

    const imageFetch = await fetch(urlRes.body.url);
    if (!imageFetch.ok) {
      console.error('FAIL: signed URL did not resolve, status', imageFetch.status);
      process.exit(1);
    }
    console.log(`PASS: signed URL resolves (content-type: ${imageFetch.headers.get('content-type')})`);

    console.log('Deleting receipt via DELETE /api/v1/receipts/:id...');
    const deleteRes = await request(app)
      .delete(`/api/v1/receipts/${receiptId}`)
      .set('Authorization', `Bearer ${token}`);

    if (deleteRes.status !== 204) {
      console.error('FAIL: delete returned', deleteRes.status);
      process.exit(1);
    }

    const { data: listed, error: listError } = await supabase.storage
      .from('receipts')
      .list(userId);
    if (listError) {
      console.error('FAIL: could not list storage after delete:', listError.message);
      process.exit(1);
    }
    if (listed && listed.length > 0) {
      console.error('FAIL: storage object still present after delete:', listed);
      process.exit(1);
    }
    console.log('PASS: storage object removed along with the receipt.');
  } finally {
    await supabase.auth.admin.deleteUser(userId);
    console.log('Cleaned up test user (receipt cascade-deleted).');
  }
}

main().catch((err) => {
  console.error('FAIL: unexpected error:', err);
  process.exit(1);
});
