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
 * - categories (migration 20260929100000): base rows are read-only, other
 *   users' custom rows are invisible and untouchable, custom names can't
 *   clash with base names; a user can still manage their own custom rows
 * - transactions (migration 20260929100200): read own only, no client writes
 * - delete_custom_category() is not callable by clients
 * - rate_limit_counters (migration 20260929120000): no client can read or
 *   write it, and rate_limit_increment/decrement/reset() are service-role
 *   only (while the service role itself can use them)
 */
process.env.NODE_ENV = 'test';

import 'dotenv/config';
import WebSocket from 'ws';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { BASE_CATEGORY_IDS, OTHER_CATEGORY_ID } from '../src/services/categories';

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
    // Seed one receipt + budget + custom category + transaction per user
    // with the service role. Seeding errors abort the run (a silent seed
    // failure would make the "sees only own rows" checks meaningless).
    const must = <T>(label: string, result: { data: T; error: unknown }): NonNullable<T> => {
      if (result.error || result.data === null || result.data === undefined) throw new Error(`seed ${label} failed: ${JSON.stringify(result.error)}`);
      return result.data as NonNullable<T>;
    };
    const raw = { merchant: 'Verify', total: 1, date: '2026-09-01', items: [] };
    const receipts = must(
      'receipts',
      await supabase
        .from('receipts')
        .insert([
          { user_id: idA, raw_response: raw },
          { user_id: idB, raw_response: raw },
        ])
        .select('id, user_id')
    );
    const receiptA = receipts.find((r) => r.user_id === idA)!.id;
    const receiptB = receipts.find((r) => r.user_id === idB)!.id;
    must(
      'budgets',
      await supabase
        .from('budgets')
        .insert([
          { user_id: idA, category: 'Other', category_id: OTHER_CATEGORY_ID, monthly_limit: 100 },
          { user_id: idB, category: 'Other', category_id: OTHER_CATEGORY_ID, monthly_limit: 100 },
        ])
        .select('id')
    );
    const catA = must('category A', await supabase.from('categories').insert({ user_id: idA, name: `VerifyA${stamp}`.slice(0, 30) }).select('id').single()).id as string;
    const catB = must('category B', await supabase.from('categories').insert({ user_id: idB, name: `VerifyB${stamp}`.slice(0, 30) }).select('id, name').single());
    must(
      'transactions',
      await supabase
        .from('transactions')
        .insert([
          { receipt_id: receiptA, user_id: idA, category_id: catA, name: 'A item', amount: 1, date: '2026-09-01', position: 0 },
          { receipt_id: receiptB, user_id: idB, category_id: catB.id, name: 'B item', amount: 2, date: '2026-09-01', position: 0 },
        ])
        .select('id')
    );

    // --- Signed out: nothing is readable.
    const anon = anonClient();
    for (const table of ['profiles', 'receipts', 'budgets', 'categories', 'transactions', 'admin_audit_log', 'rate_limit_violations', 'scan_failures', 'rate_limit_counters']) {
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
    for (const table of ['admin_audit_log', 'rate_limit_violations', 'scan_failures', 'rate_limit_counters']) {
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

    // --- categories: base rows are read-only.
    const { data: visibleCats } = await asA.from('categories').select('id, user_id, is_base');
    const cats = visibleCats ?? [];
    check(
      cats.length === 7 &&
        cats.every((c) => c.user_id === null || c.user_id === idA) &&
        Object.values(BASE_CATEGORY_IDS).every((id) => cats.some((c) => c.id === id && c.is_base === true)) &&
        cats.some((c) => c.id === catA && c.is_base === false),
      'user sees the 6 base categories + only own custom ones',
      `user sees categories: ${JSON.stringify(cats)}`
    );

    await asA.from('categories').update({ name: 'Hacked', color: '#000000' }).eq('id', OTHER_CATEGORY_ID);
    const { data: otherAfter } = await supabase.from('categories').select('name, color').eq('id', OTHER_CATEGORY_ID).single();
    check(otherAfter?.name === 'Other' && otherAfter?.color !== '#000000', "user can't update a base category", `base category changed: ${JSON.stringify(otherAfter)}`);

    await asA.from('categories').delete().eq('id', OTHER_CATEGORY_ID);
    const { data: otherStill } = await supabase.from('categories').select('id').eq('id', OTHER_CATEGORY_ID).maybeSingle();
    check(!!otherStill, "user can't delete a base category", 'user deleted a base category');

    const { error: baseInsert } = await asA.from('categories').insert({ user_id: null, name: `Base${stamp}`.slice(0, 30) });
    check(!!baseInsert, "user can't create a base category", 'user created a base category');

    const { error: clashInsert } = await asA.from('categories').insert({ user_id: idA, name: 'groceries' });
    check(!!clashInsert, "user can't create a custom category named like a base one", 'user created a custom "groceries"');

    // --- categories: other users' custom rows.
    const { data: readB } = await asA.from('categories').select('id').eq('id', catB.id);
    check((readB ?? []).length === 0, "user can't read another user's category", "user read another user's category");

    await asA.from('categories').update({ name: 'Stolen' }).eq('id', catB.id);
    const { data: bCatAfter } = await supabase.from('categories').select('name').eq('id', catB.id).single();
    check(bCatAfter?.name === catB.name, "user can't rename another user's category", `another user's category renamed to ${bCatAfter?.name}`);

    await asA.from('categories').delete().eq('id', catB.id);
    const { data: bCatStill } = await supabase.from('categories').select('id').eq('id', catB.id).maybeSingle();
    check(!!bCatStill, "user can't delete another user's category", "user deleted another user's category");

    const { error: foreignCatInsert } = await asA.from('categories').insert({ user_id: idB, name: `Evil${stamp}`.slice(0, 30) });
    check(!!foreignCatInsert, "user can't create a category for another user", 'user created a category for another user');

    const { error: moveError } = await asA.from('categories').update({ user_id: idB }).eq('id', catA);
    const { data: catAOwner } = await supabase.from('categories').select('user_id').eq('id', catA).single();
    check(!!moveError && catAOwner?.user_id === idA, "user can't move own category to another user", 'user changed categories.user_id');

    const { error: rpcError } = await asA.rpc('delete_custom_category', { p_user_id: idB, p_category_id: catB.id });
    const { data: bCatAfterRpc } = await supabase.from('categories').select('id').eq('id', catB.id).maybeSingle();
    check(!!rpcError && !!bCatAfterRpc, "user can't call delete_custom_category", 'user called delete_custom_category');

    const { error: foreignBudgetCat } = await asA
      .from('budgets')
      .insert({ user_id: idA, category: 'x', category_id: catB.id, monthly_limit: 1 });
    check(!!foreignBudgetCat, "user can't budget against another user's category", "user created a budget on another user's category");

    // Own custom categories stay manageable (the policies aren't too strict).
    const ownName = `Own${stamp}`.slice(0, 30);
    const { data: own, error: ownInsert } = await asA.from('categories').insert({ user_id: idA, name: ownName }).select('id').single();
    const { error: ownRename } = own ? await asA.from('categories').update({ name: `${ownName}x`.slice(0, 30) }).eq('id', own.id) : { error: 'no row' };
    const { error: ownDelete } = own ? await asA.from('categories').delete().eq('id', own.id) : { error: 'no row' };
    const { data: ownGone } = own ? await supabase.from('categories').select('id').eq('id', own.id).maybeSingle() : { data: 'x' };
    check(
      !ownInsert && !ownRename && !ownDelete && !ownGone,
      'user can create, rename and delete own custom category',
      `own category management failed: ${JSON.stringify({ ownInsert, ownRename, ownDelete, ownGone })}`
    );

    // --- transactions: read own only, no writes.
    const { data: txRows } = await asA.from('transactions').select('user_id');
    check(
      (txRows ?? []).length > 0 && txRows!.every((r) => r.user_id === idA),
      'user sees only own transactions',
      `user sees transactions: ${JSON.stringify(txRows)}`
    );

    const { error: txInsert } = await asA
      .from('transactions')
      .insert({ receipt_id: receiptA, user_id: idA, category_id: OTHER_CATEGORY_ID, amount: 5, position: 1 });
    check(!!txInsert, "user can't insert a transaction", 'user inserted a transaction');

    await asA.from('transactions').update({ amount: 999 }).eq('user_id', idA);
    await asA.from('transactions').delete().eq('user_id', idA);
    const { data: aTx } = await supabase.from('transactions').select('amount').eq('user_id', idA);
    check(
      (aTx ?? []).length === 1 && Number(aTx![0].amount) === 1,
      "user can't update or delete transactions",
      `user changed transactions: ${JSON.stringify(aTx)}`
    );

    // --- rate_limit_counters: backend-only (service role via RPC).
    const rlKey = `verify-rls:${stamp}`;
    const { data: rlSeed, error: rlSeedError } = await supabase.rpc('rate_limit_increment', { p_key: rlKey, p_window_ms: 60_000 });
    const rlSeedRow = Array.isArray(rlSeed) ? rlSeed[0] : rlSeed;
    check(
      !rlSeedError && rlSeedRow?.total_hits === 1,
      'service role can call rate_limit_increment',
      `service role rate_limit_increment failed: ${JSON.stringify(rlSeedError ?? rlSeed)}`
    );
    for (const [label, client] of [
      ['anon', anon],
      ['user', asA],
    ] as const) {
      const { data: rlRead } = await client.from('rate_limit_counters').select('*').eq('key', rlKey);
      check((rlRead ?? []).length === 0, `${label} can't read rate_limit_counters`, `${label} read rate_limit_counters`);

      const { error: rlInsert } = await client
        .from('rate_limit_counters')
        .insert({ key: `${rlKey}:${label}`, hits: 0, reset_at: new Date(Date.now() + 60_000).toISOString() });
      check(!!rlInsert, `${label} can't insert into rate_limit_counters`, `${label} inserted into rate_limit_counters`);

      await client.from('rate_limit_counters').update({ hits: 0 }).eq('key', rlKey);
      await client.from('rate_limit_counters').delete().eq('key', rlKey);

      for (const [fn, args] of [
        ['rate_limit_increment', { p_key: rlKey, p_window_ms: 60_000 }],
        ['rate_limit_decrement', { p_key: rlKey }],
        ['rate_limit_reset', { p_key: rlKey }],
      ] as const) {
        const { error } = await client.rpc(fn, args);
        check(!!error, `${label} can't call ${fn}`, `${label} called ${fn}`);
      }
    }
    const { data: rlAfter } = await supabase.from('rate_limit_counters').select('hits').eq('key', rlKey).maybeSingle();
    check(rlAfter?.hits === 1, "clients couldn't change a rate-limit counter", `rate-limit counter changed by a client: ${JSON.stringify(rlAfter)}`);
    const { data: rlStray } = await supabase.from('rate_limit_counters').select('key').like('key', `${rlKey}:%`);
    check((rlStray ?? []).length === 0, 'no client-inserted rate-limit rows exist', `client-inserted rate-limit rows: ${JSON.stringify(rlStray)}`);
    await supabase.rpc('rate_limit_reset', { p_key: rlKey });
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
