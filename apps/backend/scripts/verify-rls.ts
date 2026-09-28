/**
 * Standalone verification script — not part of the Jest suite.
 *
 * Attacks the real Supabase project the way a client holding the public anon
 * key (it ships in the mobile app) could, going straight to PostgREST and
 * bypassing our backend:
 * - anon (signed out) can read nothing
 * - a signed-in user sees only their own rows, can't write other users' rows,
 *   and can't touch admin-only tables
 * - a user can't grant themselves admin or rewrite their profile email
 *   (migration 20260928120000), but can still edit their own name
 */
process.env.NODE_ENV = 'test';

import 'dotenv/config';
import WebSocket from 'ws';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@smartbudget/shared/lib/supabase';

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;

function anonClient(accessToken?: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as any },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

async function main() {
  const failures: string[] = [];
  const check = (ok: boolean, pass: string, fail: string) => {
    if (ok) console.log(`PASS: ${pass}`);
    else failures.push(fail);
  };

  const stamp = Date.now();
  const password = 'VerifyRls123!';
  const emailA = `verify-rls-a-${stamp}@example.com`;
  const emailB = `verify-rls-b-${stamp}@example.com`;
  const { data: a } = await supabase.auth.admin.createUser({ email: emailA, password, email_confirm: true });
  const { data: b } = await supabase.auth.admin.createUser({ email: emailB, password, email_confirm: true });
  const idA = a!.user!.id;
  const idB = b!.user!.id;

  try {
    // Seed one receipt + budget per user with the service role.
    const raw = { merchant: 'Verify', total: 1, date: '2026-09-01', items: [] };
    await supabase.from('receipts').insert([
      { user_id: idA, raw_response: raw },
      { user_id: idB, raw_response: raw },
    ]);
    await supabase.from('budgets').insert([
      { user_id: idA, category: 'Other', monthly_limit: 100 },
      { user_id: idB, category: 'Other', monthly_limit: 100 },
    ]);

    // --- Signed out: nothing is readable.
    const anon = anonClient();
    for (const table of ['profiles', 'receipts', 'budgets', 'admin_audit_log', 'rate_limit_violations', 'scan_failures']) {
      const { data } = await anon.from(table).select('*').limit(1);
      check((data ?? []).length === 0, `anon reads nothing from ${table}`, `anon can read ${table}`);
    }

    // --- Signed in as A.
    const { data: signIn, error: signInError } = await anonClient().auth.signInWithPassword({ email: emailA, password });
    if (signInError || !signIn.session) throw new Error(`sign-in as A failed: ${signInError?.message}`);
    const asA = anonClient(signIn.session.access_token);

    for (const table of ['receipts', 'budgets'] as const) {
      const { data } = await asA.from(table).select('user_id');
      const rows = data ?? [];
      check(
        rows.length > 0 && rows.every((r) => r.user_id === idA),
        `user sees only own ${table}`,
        `user sees other users' ${table}: ${JSON.stringify(rows)}`
      );
    }
    const { data: profiles } = await asA.from('profiles').select('id');
    check(
      (profiles ?? []).length === 1 && profiles![0].id === idA,
      'user sees only own profile',
      `user sees profiles: ${JSON.stringify(profiles)}`
    );
    for (const table of ['admin_audit_log', 'rate_limit_violations', 'scan_failures']) {
      const { data } = await asA.from(table).select('*').limit(1);
      check((data ?? []).length === 0, `user reads nothing from ${table}`, `user can read ${table}`);
    }

    const { error: foreignInsert } = await asA.from('receipts').insert({ user_id: idB, raw_response: raw });
    check(!!foreignInsert, "user can't insert a receipt for another user", 'user inserted a receipt for another user');

    await asA.from('budgets').update({ monthly_limit: 1 }).eq('user_id', idB);
    const { data: bBudget } = await supabase.from('budgets').select('monthly_limit').eq('user_id', idB).single();
    check(Number(bBudget?.monthly_limit) === 100, "user can't modify another user's budget", "user modified another user's budget");

    // --- Privilege escalation via profile columns.
    await asA.from('profiles').update({ is_admin: true }).eq('id', idA);
    const { data: afterAdmin } = await supabase.from('profiles').select('is_admin').eq('id', idA).single();
    check(afterAdmin?.is_admin === false, "user can't set own is_admin", 'user granted themselves admin (is_admin=true)');

    await asA.from('profiles').update({ email: 'spoofed@example.com' }).eq('id', idA);
    const { data: afterEmail } = await supabase.from('profiles').select('email').eq('id', idA).single();
    check(afterEmail?.email === emailA, "user can't rewrite own profile email", `user rewrote profile email to ${afterEmail?.email}`);

    const { error: nameError } = await asA.from('profiles').update({ name: 'Renamed' }).eq('id', idA);
    const { data: afterName } = await supabase.from('profiles').select('name').eq('id', idA).single();
    check(
      !nameError && afterName?.name === 'Renamed',
      'user can still update own name',
      `user can no longer update own name: ${nameError?.message ?? afterName?.name}`
    );
  } finally {
    await supabase.auth.admin.deleteUser(idA);
    await supabase.auth.admin.deleteUser(idB);
  }

  if (failures.length > 0) {
    console.error(`\nFAILED (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('\nAll RLS checks passed.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
