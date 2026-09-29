import request from 'supertest';

jest.mock('@smartbudget/shared/lib/supabase', () => ({
  supabase: require('../testUtils/supabaseMock').supabase,
}));

jest.mock('@smartbudget/shared/lib/supabaseAuth', () => ({
  supabaseAuth: require('../testUtils/supabaseMock').supabaseAuth,
}));

// The transactions sync (best-effort, after scan/patch) is covered in
// receiptTransactionSync.test.ts; stubbed here so these tests' queued
// Supabase results stay aligned with the calls they are about.
jest.mock('../services/transactionSync', () => ({
  syncReceiptTransactions: jest.fn(async () => true),
}));

jest.mock('../services/claude', () => ({
  scanReceipt: jest.fn(async () => ({
    extraction: { merchant: 'Test Store', total: 10, date: '2026-01-01', items: [] },
    usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: null, cache_read_input_tokens: null },
  })),
  RECEIPT_CATEGORIES: ['Groceries', 'Dining', 'Transport', 'Entertainment', 'Health', 'Other'],
}));

import { app } from '../index';
import { queueResult, queueStorageResult, resetQueue } from '../testUtils/supabaseMock';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { findDuplicateReceipt, normalizeMerchant, totalInCents } from '../services/duplicateReceipt';

interface Row {
  id: string;
  user_id: string;
  raw_response: { merchant: unknown; total: unknown; date: unknown; items?: unknown[] };
  created_at: string;
}

function row(id: string, overrides: Partial<Row['raw_response']> = {}, extra: Partial<Row> = {}): Row {
  return {
    id,
    user_id: 'user-123',
    raw_response: { merchant: 'Test Store', total: 10, date: '2026-01-01', items: [], ...overrides },
    created_at: '2026-01-01T00:00:00Z',
    ...extra,
  };
}

/**
 * A query builder that actually applies the eq/neq filters and ordering to an
 * in-memory table — so a test can prove the lookup is scoped by the query
 * itself (another user's identical row is present in the table and must not
 * come back), not by the mock returning the "right" rows.
 */
function fakeTable(rows: Row[]) {
  const filters: Array<(r: Row) => boolean> = [];
  let orderDesc: string | null = null;
  const valueOf = (r: Row, column: string): unknown => {
    const json = /^raw_response->>(\w+)$/.exec(column);
    if (json) {
      const v = (r.raw_response as Record<string, unknown>)[json[1]];
      return v === null || v === undefined ? null : String(v);
    }
    return (r as unknown as Record<string, unknown>)[column];
  };
  const builder: any = {
    select: jest.fn(() => builder),
    eq: jest.fn((column: string, value: unknown) => {
      filters.push((r) => valueOf(r, column) === value);
      return builder;
    }),
    neq: jest.fn((column: string, value: unknown) => {
      filters.push((r) => valueOf(r, column) !== value);
      return builder;
    }),
    order: jest.fn((column: string, opts?: { ascending?: boolean }) => {
      orderDesc = opts?.ascending === false ? column : null;
      return builder;
    }),
    then: (resolve: (v: unknown) => void) => {
      let data = rows.filter((r) => filters.every((f) => f(r)));
      if (orderDesc) {
        const col = orderDesc;
        data = [...data].sort((a, b) => String(valueOf(b, col)).localeCompare(String(valueOf(a, col))));
      }
      resolve({ data, error: null });
    },
  };
  return builder;
}

/** Route the next supabase.from() call to an in-memory table (others keep using the queue mock). */
function nextFromIsTable(rows: Row[]) {
  const builder = fakeTable(rows);
  (supabase.from as jest.Mock).mockImplementationOnce(() => builder);
  return builder;
}

beforeEach(() => {
  resetQueue();
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore();
});

describe('normalizeMerchant / totalInCents', () => {
  it('ignores case and surrounding / repeated whitespace', () => {
    expect(normalizeMerchant('  SUPER   Pharm ')).toBe('super pharm');
    expect(normalizeMerchant('   ')).toBeNull();
    expect(normalizeMerchant(5)).toBeNull();
  });

  it('compares money in whole cents', () => {
    expect(totalInCents(0.1 + 0.2)).toBe(totalInCents(0.3));
    expect(totalInCents(10.1)).toBe(1010);
    expect(totalInCents('10.10')).toBe(1010);
    expect(totalInCents(10.1)).not.toBe(totalInCents(10.11));
    expect(totalInCents(null)).toBeNull();
    expect(totalInCents('abc')).toBeNull();
  });
});

describe('findDuplicateReceipt', () => {
  const self = row('self');

  it('returns the matching receipt', async () => {
    nextFromIsTable([self, row('older')]);
    await expect(findDuplicateReceipt('user-123', self)).resolves.toEqual({
      id: 'older',
      merchant: 'Test Store',
      date: '2026-01-01',
      total: 10,
    });
  });

  it('returns null when nothing matches', async () => {
    nextFromIsTable([self, row('other', { merchant: 'Another Shop', total: 55, date: '2026-02-02' })]);
    await expect(findDuplicateReceipt('user-123', self)).resolves.toBeNull();
  });

  it('matches despite case and whitespace differences in the merchant', async () => {
    nextFromIsTable([self, row('older', { merchant: '  TEST   store \t' })]);
    const dup = await findDuplicateReceipt('user-123', self);
    expect(dup?.id).toBe('older');
  });

  it('matches totals that are equal to the cent despite float noise', async () => {
    const receipt = row('self', { total: 0.3 });
    nextFromIsTable([receipt, row('older', { total: 0.1 + 0.2 })]);
    expect((await findDuplicateReceipt('user-123', receipt))?.id).toBe('older');
  });

  it('does not match the same merchant on a different date', async () => {
    nextFromIsTable([self, row('older', { date: '2026-01-02' })]);
    await expect(findDuplicateReceipt('user-123', self)).resolves.toBeNull();
  });

  it('does not match the same merchant with a different total', async () => {
    nextFromIsTable([self, row('older', { total: 10.01 })]);
    await expect(findDuplicateReceipt('user-123', self)).resolves.toBeNull();
  });

  it('never matches the receipt against itself', async () => {
    const builder = nextFromIsTable([self]);
    await expect(findDuplicateReceipt('user-123', self)).resolves.toBeNull();
    expect(builder.neq).toHaveBeenCalledWith('id', 'self');
  });

  it("does not match another user's identical receipt (scoped in the query)", async () => {
    const builder = nextFromIsTable([self, row('theirs', {}, { user_id: 'user-999', created_at: '2026-06-01T00:00:00Z' })]);
    await expect(findDuplicateReceipt('user-123', self)).resolves.toBeNull();
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-123');
  });

  it("returns this user's match, not a newer identical receipt of another user", async () => {
    nextFromIsTable([
      self,
      row('theirs', {}, { user_id: 'user-999', created_at: '2026-06-01T00:00:00Z' }),
      row('mine', {}, { created_at: '2026-01-01T00:00:00Z' }),
    ]);
    expect((await findDuplicateReceipt('user-123', self))?.id).toBe('mine');
  });

  it('returns the most recent of several matches', async () => {
    nextFromIsTable([
      self,
      row('oldest', {}, { created_at: '2026-01-01T08:00:00Z' }),
      row('newest', {}, { created_at: '2026-01-03T08:00:00Z' }),
      row('middle', {}, { created_at: '2026-01-02T08:00:00Z' }),
    ]);
    expect((await findDuplicateReceipt('user-123', self))?.id).toBe('newest');
  });

  it.each([
    ['no date', { date: null }],
    ['no merchant', { merchant: '  ' }],
    ['no total', { total: null }],
  ])('skips the lookup (null) when the receipt has %s', async (_label, overrides) => {
    await expect(findDuplicateReceipt('user-123', row('self', overrides))).resolves.toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('returns null and logs when the query errors', async () => {
    queueResult({ data: null, error: { message: 'db down' } });
    await expect(findDuplicateReceipt('user-123', self)).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledWith('Duplicate receipt lookup failed:', { message: 'db down' });
  });

  it('returns null and logs when the query throws', async () => {
    (supabase.from as jest.Mock).mockImplementationOnce(() => {
      throw new Error('network');
    });
    await expect(findDuplicateReceipt('user-123', self)).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledWith('Duplicate receipt lookup failed:', expect.any(Error));
  });
});

describe('POST /api/v1/receipts/scan — duplicate_of', () => {
  const SAVED = row('receipt-new', {}, { created_at: '2026-09-29T10:00:00Z' });

  function scan() {
    return request(app)
      .post('/api/v1/receipts/scan')
      .set('Authorization', 'Bearer valid-token')
      .send({ image: 'ZmFrZS1pbWFnZS1kYXRh', mediaType: 'image/jpeg' });
  }

  it('returns the matching earlier receipt', async () => {
    queueResult({ data: [], error: null }); // own custom categories (prompt)
    queueResult({ data: SAVED, error: null }); // insert
    queueStorageResult({ error: null }); // upload
    queueResult({ data: SAVED, error: null }); // update image_path
    queueResult({ data: [row('older', { merchant: 'test store ' })], error: null }); // duplicate lookup

    const response = await scan();

    expect(response.status).toBe(201);
    expect(response.body.receipt.id).toBe('receipt-new');
    expect(response.body.duplicate_of).toEqual({ id: 'older', merchant: 'test store ', date: '2026-01-01', total: 10 });

    const lookup = (supabase.from as jest.Mock).mock.results[3].value;
    expect(lookup.eq).toHaveBeenCalledWith('user_id', 'user-123');
    expect(lookup.eq).toHaveBeenCalledWith('raw_response->>date', '2026-01-01');
    expect(lookup.neq).toHaveBeenCalledWith('id', 'receipt-new');
  });

  it('returns duplicate_of: null when there is no match', async () => {
    queueResult({ data: [], error: null }); // own custom categories (prompt)
    queueResult({ data: SAVED, error: null });
    queueStorageResult({ error: null });
    queueResult({ data: SAVED, error: null });
    queueResult({ data: [row('older', { total: 11 })], error: null });

    const response = await scan();

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('duplicate_of', null);
  });

  it("does not report another user's identical receipt", async () => {
    queueResult({ data: [], error: null }); // own custom categories (prompt)
    queueResult({ data: SAVED, error: null });
    queueStorageResult({ error: null });
    queueResult({ data: SAVED, error: null });
    nextFromIsTableAfter(3, [SAVED, row('theirs', {}, { user_id: 'user-999' })]);

    const response = await scan();

    expect(response.status).toBe(201);
    expect(response.body.duplicate_of).toBeNull();
  });

  it('still returns 201 with duplicate_of: null when the lookup fails', async () => {
    queueResult({ data: [], error: null }); // own custom categories (prompt)
    queueResult({ data: SAVED, error: null });
    queueStorageResult({ error: null });
    queueResult({ data: SAVED, error: null });
    queueResult({ data: null, error: { message: 'db down' } });

    const response = await scan();

    expect(response.status).toBe(201);
    expect(response.body.receipt.id).toBe('receipt-new');
    expect(response.body.duplicate_of).toBeNull();
    expect(console.error).toHaveBeenCalledWith('Duplicate receipt lookup failed:', { message: 'db down' });
    // Not treated as a scan failure.
    expect(supabase.from).not.toHaveBeenCalledWith('scan_failures');
  });

  it('still returns 201 with duplicate_of: null when the lookup throws', async () => {
    queueResult({ data: [], error: null }); // own custom categories (prompt)
    queueResult({ data: SAVED, error: null });
    queueStorageResult({ error: null });
    queueResult({ data: SAVED, error: null });
    // Nothing queued for the lookup: the mock rejects.

    const response = await scan();

    expect(response.status).toBe(201);
    expect(response.body.duplicate_of).toBeNull();
  });

  it('includes duplicate_of when the image upload fails', async () => {
    queueResult({ data: [], error: null }); // own custom categories (prompt)
    queueResult({ data: SAVED, error: null });
    queueStorageResult({ error: { message: 'storage down' } });
    queueResult({ data: [row('older')], error: null });

    const response = await scan();

    expect(response.status).toBe(201);
    expect(response.body.duplicate_of?.id).toBe('older');
  });
});

/** Like nextFromIsTable, but for the from() call after `skip` queue-backed calls. */
function nextFromIsTableAfter(skip: number, rows: Row[]) {
  const from = supabase.from as jest.Mock;
  const fallback = from.getMockImplementation()!;
  for (let i = 0; i < skip; i++) from.mockImplementationOnce(fallback);
  return nextFromIsTable(rows);
}

describe('PATCH /api/v1/receipts/:id — duplicate_of', () => {
  const EXISTING = row('receipt-123', { merchant: 'Typo Stor', total: 12 });

  function patch(body: object) {
    return request(app).patch('/api/v1/receipts/receipt-123').set('Authorization', 'Bearer valid-token').send(body);
  }

  it('reports a match created by the edit (recomputed from the saved values)', async () => {
    const saved = row('receipt-123', { merchant: 'Test Store', total: 10 });
    queueResult({ data: EXISTING, error: null }); // fetch existing
    queueResult({ data: saved, error: null }); // update
    nextFromIsTableAfter(2, [saved, row('older')]);

    const response = await patch({ merchant: 'Test Store', total: 10 });

    expect(response.status).toBe(200);
    expect(response.body.receipt).toEqual(saved);
    expect(response.body.duplicate_of).toEqual({ id: 'older', merchant: 'Test Store', date: '2026-01-01', total: 10 });
  });

  it('clears the match when the edit removes it', async () => {
    const before = row('receipt-123');
    const saved = row('receipt-123', { total: 10.5 });
    queueResult({ data: before, error: null });
    queueResult({ data: saved, error: null });
    nextFromIsTableAfter(2, [saved, row('older')]);

    const response = await patch({ total: 10.5 });

    expect(response.status).toBe(200);
    expect(response.body.duplicate_of).toBeNull();
  });

  it('clears the match when the date is corrected', async () => {
    const saved = row('receipt-123', { date: '2026-01-05' });
    queueResult({ data: row('receipt-123'), error: null });
    queueResult({ data: saved, error: null });
    nextFromIsTableAfter(2, [saved, row('older')]);

    const response = await patch({ date: '05/01/2026' });

    expect(response.status).toBe(200);
    expect(response.body.duplicate_of).toBeNull();
  });

  it('scopes the lookup to the user and excludes the receipt itself', async () => {
    const saved = row('receipt-123');
    queueResult({ data: EXISTING, error: null });
    queueResult({ data: saved, error: null });
    const lookup = nextFromIsTableAfter(2, [saved, row('theirs', {}, { user_id: 'user-999' })]);

    const response = await patch({ merchant: 'Test Store', total: 10 });

    expect(response.status).toBe(200);
    expect(response.body.duplicate_of).toBeNull();
    expect(lookup.eq).toHaveBeenCalledWith('user_id', 'user-123');
    expect(lookup.neq).toHaveBeenCalledWith('id', 'receipt-123');
  });

  it('still returns 200 with duplicate_of: null when the lookup fails', async () => {
    const saved = row('receipt-123');
    queueResult({ data: EXISTING, error: null });
    queueResult({ data: saved, error: null });
    queueResult({ data: null, error: { message: 'db down' } });

    const response = await patch({ merchant: 'Test Store', total: 10 });

    expect(response.status).toBe(200);
    expect(response.body.receipt).toEqual(saved);
    expect(response.body.duplicate_of).toBeNull();
  });

  it('does not run a lookup when the patch is rejected', async () => {
    queueResult({ data: null, error: { message: 'not found' } });

    const response = await patch({ merchant: 'Hijacked' });

    expect(response.status).toBe(404);
    expect(response.body).not.toHaveProperty('duplicate_of');
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });
});
