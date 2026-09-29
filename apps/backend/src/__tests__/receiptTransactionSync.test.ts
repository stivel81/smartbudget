import request from 'supertest';

jest.mock('@smartbudget/shared/lib/supabase', () => ({
  supabase: require('../testUtils/supabaseMock').supabase,
}));

jest.mock('@smartbudget/shared/lib/supabaseAuth', () => ({
  supabaseAuth: require('../testUtils/supabaseMock').supabaseAuth,
}));

jest.mock('../services/claude', () => ({
  scanReceipt: jest.fn(async () => ({
    extraction: {
      merchant: 'Pet Shop',
      total: 23.5,
      date: '2026-09-11',
      items: [
        { name: 'Kibble', amount: 20, category: 'Other' },
        { name: 'Milk', amount: 3.5, category: 'Groceries' },
      ],
    },
    usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null },
  })),
  RECEIPT_CATEGORIES: ['Groceries', 'Dining', 'Transport', 'Entertainment', 'Health', 'Other'],
}));

import { app } from '../index';
import { queueResult, queueStorageResult, resetQueue } from '../testUtils/supabaseMock';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { BASE_CATEGORY_IDS } from '../services/categories';

const CUSTOM_PETS = 'cccccccc-0000-4000-8000-00000000000a';
const CATEGORIES = [
  ...Object.entries(BASE_CATEGORY_IDS).map(([name, id]) => ({ id, user_id: null, name })),
  { id: CUSTOM_PETS, user_id: 'user-123', name: 'Pets' },
];

const SAVED = {
  id: 'receipt-1',
  user_id: 'user-123',
  created_at: '2026-09-11T08:00:00Z',
  image_path: null,
  raw_response: {
    merchant: 'Pet Shop',
    total: 23.5,
    date: '2026-09-11',
    items: [
      { name: 'Kibble', amount: 20, category: 'Other' },
      { name: 'Milk', amount: 3.5, category: 'Groceries' },
    ],
  },
};
const WITH_IMAGE = { ...SAVED, image_path: 'user-123/receipt-1.jpg' };

function buildersFor(table: string): any[] {
  const from = supabase.from as jest.Mock;
  return from.mock.calls
    .map((call, i) => (call[0] === table ? from.mock.results[i].value : null))
    .filter(Boolean);
}

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  resetQueue();
  jest.clearAllMocks();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

function scan() {
  return request(app)
    .post('/api/v1/receipts/scan')
    .set('Authorization', 'Bearer valid-token')
    .send({ image: 'aGVsbG8=', mediaType: 'image/jpeg' });
}

function patch(body: object) {
  return request(app).patch('/api/v1/receipts/receipt-1').set('Authorization', 'Bearer valid-token').send(body);
}

describe('POST /api/v1/receipts/scan keeps transactions in sync', () => {
  it('replaces the new receipt\'s transactions from the saved raw_response', async () => {
    queueResult({ data: SAVED, error: null }); // receipt insert
    queueResult({ data: CATEGORIES, error: null }); // sync: categories
    queueResult({ error: null }); // sync: delete
    queueResult({ error: null }); // sync: insert
    queueStorageResult({ error: null }); // image upload
    queueResult({ data: WITH_IMAGE, error: null }); // image_path update
    queueResult({ data: [], error: null }); // duplicate lookup

    const response = await scan();

    expect(response.status).toBe(201);
    expect(response.body.receipt).toEqual(WITH_IMAGE);
    const [del, ins] = buildersFor('transactions');
    expect(del.eq).toHaveBeenCalledWith('receipt_id', 'receipt-1');
    expect(ins.insert).toHaveBeenCalledWith([
      { receipt_id: 'receipt-1', user_id: 'user-123', category_id: BASE_CATEGORY_IDS.Other, name: 'Kibble', amount: 20, date: '2026-09-11', position: 0 },
      { receipt_id: 'receipt-1', user_id: 'user-123', category_id: BASE_CATEGORY_IDS.Groceries, name: 'Milk', amount: 3.5, date: '2026-09-11', position: 1 },
    ]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('still returns 201 with the same body when the sync insert fails (failure is logged)', async () => {
    queueResult({ data: SAVED, error: null });
    queueResult({ data: CATEGORIES, error: null });
    queueResult({ error: null });
    queueResult({ error: { message: 'insert failed' } }); // sync insert fails
    queueStorageResult({ error: null });
    queueResult({ data: WITH_IMAGE, error: null });
    queueResult({ data: [], error: null });

    const response = await scan();

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ receipt: WITH_IMAGE, duplicate_of: null });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Transaction sync failed'), { message: 'insert failed' });
  });

  it('still returns 201 when the sync blows up before any query resolves', async () => {
    queueResult({ data: SAVED, error: null });
    queueResult({ data: null, error: { message: 'categories down' } }); // sync aborts here
    queueStorageResult({ error: null });
    queueResult({ data: WITH_IMAGE, error: null });
    queueResult({ data: [], error: null });

    const response = await scan();

    expect(response.status).toBe(201);
    expect(response.body.receipt).toEqual(WITH_IMAGE);
    expect(buildersFor('transactions')).toHaveLength(0);
  });

  it('does not sync when the receipt insert itself fails', async () => {
    queueResult({ data: null, error: { message: 'insert failed' } });

    const response = await scan();

    expect(response.status).toBe(500);
    expect(buildersFor('categories')).toHaveLength(0);
    expect(buildersFor('transactions')).toHaveLength(0);
  });
});

describe('PATCH /api/v1/receipts/:id keeps transactions in sync', () => {
  it('re-syncs from the SAVED raw_response after re-categorizing an item', async () => {
    const saved = {
      ...SAVED,
      raw_response: { ...SAVED.raw_response, items: [{ ...SAVED.raw_response.items[0], category: 'Health' }, SAVED.raw_response.items[1]] },
    };
    queueResult({ data: SAVED, error: null }); // fetch existing
    queueResult({ data: saved, error: null }); // update
    queueResult({ data: CATEGORIES, error: null }); // sync: categories
    queueResult({ error: null }); // sync: delete
    queueResult({ error: null }); // sync: insert
    queueResult({ data: [], error: null }); // duplicate lookup

    const response = await patch({ items: [{ index: 0, category: 'Health' }] });

    expect(response.status).toBe(200);
    const [, ins] = buildersFor('transactions');
    expect(ins.insert.mock.calls[0][0][0]).toMatchObject({ position: 0, category_id: BASE_CATEGORY_IDS.Health });
  });

  it('still returns 200 with the saved receipt when the sync delete fails (failure is logged)', async () => {
    queueResult({ data: SAVED, error: null });
    queueResult({ data: { ...SAVED, raw_response: { ...SAVED.raw_response, merchant: 'Fixed' } }, error: null });
    queueResult({ data: CATEGORIES, error: null });
    queueResult({ error: { message: 'delete failed' } });
    queueResult({ data: [], error: null });

    const response = await patch({ merchant: 'Fixed' });

    expect(response.status).toBe(200);
    expect(response.body.receipt.raw_response.merchant).toBe('Fixed');
    expect(response.body.duplicate_of).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('(delete)'), { message: 'delete failed' });
  });

  it('does not sync when the receipt update fails', async () => {
    queueResult({ data: SAVED, error: null });
    queueResult({ data: null, error: { message: 'update failed' } });

    const response = await patch({ merchant: 'Fixed' });

    expect(response.status).toBe(500);
    expect(buildersFor('transactions')).toHaveLength(0);
  });

  it('does not sync when the receipt is not found', async () => {
    queueResult({ data: null, error: { message: 'no rows' } });

    const response = await patch({ merchant: 'Fixed' });

    expect(response.status).toBe(404);
    expect(buildersFor('categories')).toHaveLength(0);
  });
});
