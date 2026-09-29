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
      merchant: 'Test Store',
      total: 10,
      date: '2026-01-01',
      items: [],
    },
    usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: null, cache_read_input_tokens: null },
  })),
  RECEIPT_CATEGORIES: ['Groceries', 'Dining', 'Transport', 'Entertainment', 'Health', 'Other'],
}));

import { app } from '../index';
import { queueResult, queueStorageResult, resetQueue } from '../testUtils/supabaseMock';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { scanReceipt } from '../services/claude';

const SAMPLE_RECEIPT = {
  id: 'receipt-123',
  user_id: 'user-123',
  raw_response: { merchant: 'Test Store', total: 10, date: '2026-01-01', items: [] },
  created_at: '2026-01-01T00:00:00Z',
  image_path: null,
};

beforeEach(() => {
  resetQueue();
  jest.clearAllMocks();
});

describe('POST /api/v1/receipts/scan', () => {
  it('scans a receipt, uploads the image, and returns 201 on the happy path', async () => {
    queueResult({ data: SAMPLE_RECEIPT, error: null }); // insert
    queueStorageResult({ error: null }); // storage upload
    queueResult({ data: { ...SAMPLE_RECEIPT, image_path: 'user-123/receipt-123.jpg' }, error: null }); // update with image_path

    const response = await request(app)
      .post('/api/v1/receipts/scan')
      .set('Authorization', 'Bearer valid-token')
      .send({ image: 'ZmFrZS1pbWFnZS1kYXRh', mediaType: 'image/jpeg' });

    expect(response.status).toBe(201);
    expect(response.body.receipt.raw_response.merchant).toBe('Test Store');
    expect(response.body.receipt.image_path).toBe('user-123/receipt-123.jpg');
  });

  it("persists Claude's token usage on the receipt row", async () => {
    queueResult({ data: SAMPLE_RECEIPT, error: null }); // insert
    queueStorageResult({ error: null }); // storage upload
    queueResult({ data: { ...SAMPLE_RECEIPT, image_path: 'user-123/receipt-123.jpg' }, error: null }); // update

    await request(app)
      .post('/api/v1/receipts/scan')
      .set('Authorization', 'Bearer valid-token')
      .send({ image: 'ZmFrZS1pbWFnZS1kYXRh', mediaType: 'image/jpeg' });

    const insertCall = (supabase.from as jest.Mock).mock.results[0].value.insert as jest.Mock;
    expect(insertCall).toHaveBeenCalledWith({
      user_id: 'user-123',
      raw_response: { merchant: 'Test Store', total: 10, date: '2026-01-01', items: [] },
      claude_usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: null, cache_read_input_tokens: null },
    });
  });

  it('logs a scan_failures row and returns 500 when Claude analysis fails', async () => {
    (scanReceipt as jest.Mock).mockRejectedValueOnce(new Error('Claude did not return a parseable receipt extraction'));
    queueResult({ error: null }); // scan_failures insert

    const response = await request(app)
      .post('/api/v1/receipts/scan')
      .set('Authorization', 'Bearer valid-token')
      .send({ image: 'ZmFrZS1pbWFnZS1kYXRh', mediaType: 'image/jpeg' });

    expect(response.status).toBe(500);
    const insertCall = (supabase.from as jest.Mock).mock.results[0].value.insert as jest.Mock;
    expect(insertCall).toHaveBeenCalledWith({
      user_id: 'user-123',
      error_message: 'Claude did not return a parseable receipt extraction',
      media_type: 'image/jpeg',
    });
  });

  it('still returns 500 (not a crash) if logging the scan failure itself fails', async () => {
    (scanReceipt as jest.Mock).mockRejectedValueOnce(new Error('Claude timed out'));
    // No queueResult() — the scan_failures insert will hit the mock's
    // "no result queued" throw, exercising the nested try/catch around it.

    const response = await request(app)
      .post('/api/v1/receipts/scan')
      .set('Authorization', 'Bearer valid-token')
      .send({ image: 'ZmFrZS1pbWFnZS1kYXRh', mediaType: 'image/jpeg' });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to analyze receipt');
  });

  it('still returns 201 if the image upload fails', async () => {
    queueResult({ data: SAMPLE_RECEIPT, error: null }); // insert
    queueStorageResult({ error: { message: 'upload failed' } }); // storage upload fails

    const response = await request(app)
      .post('/api/v1/receipts/scan')
      .set('Authorization', 'Bearer valid-token')
      .send({ image: 'ZmFrZS1pbWFnZS1kYXRh', mediaType: 'image/jpeg' });

    expect(response.status).toBe(201);
    expect(response.body.receipt.raw_response.merchant).toBe('Test Store');
  });

  describe('receipt date normalization', () => {
    async function scanWithDate(date: unknown) {
      (scanReceipt as jest.Mock).mockResolvedValueOnce({
        extraction: { merchant: 'טיטניום בע"מ', total: 350, date, items: [{ name: 'כללי', amount: 350, category: 'Other' }] },
        usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: null, cache_read_input_tokens: null },
      });
      queueResult({ data: SAMPLE_RECEIPT, error: null }); // insert
      queueStorageResult({ error: null }); // storage upload
      queueResult({ data: SAMPLE_RECEIPT, error: null }); // update with image_path

      const response = await request(app)
        .post('/api/v1/receipts/scan')
        .set('Authorization', 'Bearer valid-token')
        .send({ image: 'ZmFrZS1pbWFnZS1kYXRh', mediaType: 'image/jpeg' });
      expect(response.status).toBe(201);

      const insert = (supabase.from as jest.Mock).mock.results[0].value.insert as jest.Mock;
      return insert.mock.calls[0][0].raw_response;
    }

    it('converts a day-first DD/MM/YYYY date copied off an Israeli receipt to ISO before saving', async () => {
      const saved = await scanWithDate('17/08/2026');
      expect(saved).toEqual({
        merchant: 'טיטניום בע"מ',
        total: 350,
        date: '2026-08-17',
        items: [{ name: 'כללי', amount: 350, category: 'Other' }],
      });
    });

    it('converts DD.MM.YY too', async () => {
      expect((await scanWithDate('17.08.26')).date).toBe('2026-08-17');
    });

    it('keeps an ISO date as-is', async () => {
      expect((await scanWithDate('2026-08-17')).date).toBe('2026-08-17');
    });

    it('saves null when Claude found no date', async () => {
      expect((await scanWithDate(null)).date).toBeNull();
    });

    it('saves null for an impossible date instead of a string clients would misplace', async () => {
      expect((await scanWithDate('31/04/2026')).date).toBeNull();
    });
  });

  it('returns 400 when image is missing', async () => {
    const response = await request(app)
      .post('/api/v1/receipts/scan')
      .set('Authorization', 'Bearer valid-token')
      .send({ mediaType: 'image/jpeg' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/image/i);
  });

  it('returns 401 when Authorization header is missing', async () => {
    const response = await request(app)
      .post('/api/v1/receipts/scan')
      .send({ image: 'ZmFrZQ==', mediaType: 'image/jpeg' });

    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/receipts', () => {
  it("returns the current user's receipts on the happy path", async () => {
    queueResult({ data: [SAMPLE_RECEIPT], error: null });

    const response = await request(app)
      .get('/api/v1/receipts')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.receipts).toHaveLength(1);
    expect(response.body.receipts[0].raw_response.merchant).toBe('Test Store');
  });

  it('returns 401 when Authorization header is missing', async () => {
    const response = await request(app).get('/api/v1/receipts');

    expect(response.status).toBe(401);
  });
});

describe('PATCH /api/v1/receipts/:id', () => {
  it('updates the merchant and total on the happy path', async () => {
    queueResult({ data: SAMPLE_RECEIPT, error: null }); // fetch existing
    queueResult({
      data: { ...SAMPLE_RECEIPT, raw_response: { ...SAMPLE_RECEIPT.raw_response, merchant: 'Corrected Store', total: 20 } },
      error: null,
    }); // update result

    const response = await request(app)
      .patch('/api/v1/receipts/receipt-123')
      .set('Authorization', 'Bearer valid-token')
      .send({ merchant: 'Corrected Store', total: 20 });

    expect(response.status).toBe(200);
    expect(response.body.receipt.raw_response.merchant).toBe('Corrected Store');
    expect(response.body.receipt.raw_response.total).toBe(20);
  });

  describe('item category updates', () => {
    const THREE_ITEMS = {
      ...SAMPLE_RECEIPT,
      raw_response: {
        merchant: 'Test Store',
        total: 30,
        date: '2026-01-01',
        items: [
          { name: 'Milk', amount: 10, category: 'Groceries' },
          { name: 'Coffee', amount: 12, category: 'Groceries' },
          { name: 'Bus', amount: 8, category: 'Other' },
        ],
      },
    };

    function patch(body: unknown, id = 'receipt-123') {
      return request(app)
        .patch(`/api/v1/receipts/${id}`)
        .set('Authorization', 'Bearer valid-token')
        .send(body as object);
    }

    function savedRawResponse() {
      const update = (supabase.from as jest.Mock).mock.results[1].value.update as jest.Mock;
      return update.mock.calls[0][0].raw_response;
    }

    it('updates only the given items\' categories and returns the saved receipt', async () => {
      queueResult({ data: THREE_ITEMS, error: null }); // fetch existing
      const saved = { ...THREE_ITEMS, raw_response: { ...THREE_ITEMS.raw_response } };
      queueResult({ data: saved, error: null }); // update result

      const response = await patch({ items: [{ index: 1, category: 'Dining' }, { index: 2, category: 'Transport' }] });

      expect(response.status).toBe(200);
      expect(response.body.receipt).toEqual(saved);
      expect(savedRawResponse()).toEqual({
        merchant: 'Test Store',
        total: 30,
        date: '2026-01-01',
        items: [
          { name: 'Milk', amount: 10, category: 'Groceries' },
          { name: 'Coffee', amount: 12, category: 'Dining' },
          { name: 'Bus', amount: 8, category: 'Transport' },
        ],
      });
      // Scoped to the caller on both the read and the write.
      const fetchBuilder = (supabase.from as jest.Mock).mock.results[0].value;
      const updateBuilder = (supabase.from as jest.Mock).mock.results[1].value;
      expect(fetchBuilder.eq).toHaveBeenCalledWith('user_id', 'user-123');
      expect(updateBuilder.eq).toHaveBeenCalledWith('user_id', 'user-123');
      expect(updateBuilder.eq).toHaveBeenCalledWith('id', 'receipt-123');
    });

    it('does not mutate the stored items it read', async () => {
      const existing = JSON.parse(JSON.stringify(THREE_ITEMS));
      queueResult({ data: existing, error: null });
      queueResult({ data: existing, error: null });

      await patch({ items: [{ index: 0, category: 'Health' }] });

      expect(existing.raw_response.items[0].category).toBe('Groceries');
      expect(savedRawResponse().items[0]).toEqual({ name: 'Milk', amount: 10, category: 'Health' });
    });

    it('can change the merchant, total and a category in one request', async () => {
      queueResult({ data: THREE_ITEMS, error: null });
      queueResult({ data: THREE_ITEMS, error: null });

      const response = await patch({ merchant: 'Aroma', total: 31, items: [{ index: 0, category: 'Dining' }] });

      expect(response.status).toBe(200);
      const saved = savedRawResponse();
      expect(saved.merchant).toBe('Aroma');
      expect(saved.total).toBe(31);
      expect(saved.items.map((i: { category: string }) => i.category)).toEqual(['Dining', 'Groceries', 'Other']);
    });

    it('accepts setting a category to its current value', async () => {
      queueResult({ data: THREE_ITEMS, error: null });
      queueResult({ data: THREE_ITEMS, error: null });
      expect((await patch({ items: [{ index: 0, category: 'Groceries' }] })).status).toBe(200);
    });

    it('returns 404 when the receipt does not belong to the user', async () => {
      queueResult({ data: null, error: { message: 'not found' } });

      const response = await patch({ items: [{ index: 0, category: 'Dining' }] }, 'someone-elses-receipt');

      expect(response.status).toBe(404);
      expect(supabase.from).toHaveBeenCalledTimes(1); // no write attempted
    });

    it.each([
      ['past the last item', [{ index: 3, category: 'Dining' }], /out of range/],
      ['far out of range', [{ index: 99, category: 'Dining' }], /out of range/],
    ])('returns 400 for an index %s, without writing', async (_label, items, message) => {
      queueResult({ data: THREE_ITEMS, error: null });

      const response = await patch({ items });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(message);
      expect(supabase.from).toHaveBeenCalledTimes(1);
    });

    it('returns 400 for any index when the receipt has no items', async () => {
      queueResult({ data: { ...SAMPLE_RECEIPT, raw_response: { merchant: 'M', total: 1, date: null } }, error: null });

      const response = await patch({ items: [{ index: 0, category: 'Dining' }] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Item index 0 is out of range (receipt has 0 item(s))');
    });

    it.each([
      ['negative', -1],
      ['fractional', 0.5],
      ['a string', '0'],
      ['null', null],
      ['missing', undefined],
    ])('returns 400 when an index is %s (validated before any DB read)', async (_label, index) => {
      const response = await patch({ items: [{ index, category: 'Dining' }] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Each item index must be a non-negative integer');
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it.each([
      ['unknown', 'Shopping'],
      ['wrong case', 'dining'],
      ['empty', ''],
      ['not a string', 3],
      ['missing', undefined],
    ])('returns 400 when a category is %s', async (_label, category) => {
      const response = await patch({ items: [{ index: 0, category }] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe(
        'Each item category must be one of: Groceries, Dining, Transport, Entertainment, Health, Other'
      );
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('returns 400 for duplicate indexes', async () => {
      const response = await patch({ items: [{ index: 1, category: 'Dining' }, { index: 1, category: 'Health' }] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Duplicate item index: 1');
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it.each([
      ['an empty list', []],
      ['not an array', { index: 0, category: 'Dining' }],
      ['a string', 'Dining'],
      ['null', null],
      ['a list with a non-object', ['Dining']],
      ['a list with an array', [[0, 'Dining']]],
    ])('returns 400 when items is %s', async (_label, items) => {
      const response = await patch({ items });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('items must be a non-empty array of { index, category }');
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('returns 400 for unknown fields on an item (e.g. trying to rewrite the amount)', async () => {
      const response = await patch({ items: [{ index: 0, category: 'Dining', amount: 1 }] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Unknown item field(s): amount');
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('returns 500 when saving fails', async () => {
      queueResult({ data: THREE_ITEMS, error: null });
      queueResult({ data: null, error: { message: 'db down' } });

      const response = await patch({ items: [{ index: 0, category: 'Dining' }] });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to update receipt');
    });

    it('returns 401 without a token', async () => {
      const response = await request(app)
        .patch('/api/v1/receipts/receipt-123')
        .send({ items: [{ index: 0, category: 'Dining' }] });

      expect(response.status).toBe(401);
      expect(supabase.from).not.toHaveBeenCalled();
    });
  });

  describe('body validation', () => {
    function patch(body: unknown) {
      return request(app).patch('/api/v1/receipts/receipt-123').set('Authorization', 'Bearer valid-token').send(body as object);
    }

    it('returns 400 for unknown top-level fields', async () => {
      const response = await patch({ merchant: 'X', user_id: 'someone-else', claude_usage: {} });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Unknown field(s): user_id, claude_usage');
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('returns 400 for a JSON array body', async () => {
      const response = await patch([{ merchant: 'X' }]);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Provide at least one of: merchant, total, date, items');
    });

    it.each([
      ['empty', ''],
      ['blank', '   '],
      ['not a string', 5],
    ])('returns 400 when merchant is %s', async (_label, merchant) => {
      const response = await patch({ merchant });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('merchant must be a non-empty string');
    });

    it.each([
      ['zero', 0],
      ['negative', -5],
      ['a string', '10'],
    ])('returns 400 when total is %s', async (_label, total) => {
      const response = await patch({ total });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('total must be a positive number');
    });
  });

  describe('date updates', () => {
    function patch(body: unknown) {
      return request(app).patch('/api/v1/receipts/receipt-123').set('Authorization', 'Bearer valid-token').send(body as object);
    }

    it.each([
      ['17/08/2026', '2026-08-17'],
      ['17.08.26', '2026-08-17'],
      ['2026-08-17', '2026-08-17'],
    ])('stores %s as ISO %s', async (date, expected) => {
      queueResult({ data: SAMPLE_RECEIPT, error: null });
      queueResult({ data: SAMPLE_RECEIPT, error: null });

      const response = await patch({ date });

      expect(response.status).toBe(200);
      const update = (supabase.from as jest.Mock).mock.results[1].value.update as jest.Mock;
      expect(update.mock.calls[0][0].raw_response.date).toBe(expected);
    });

    it.each([
      ['an impossible date', '31/04/2026'],
      ['junk', 'yesterday'],
      ['not a string', 20260817],
      ['null', null],
    ])('returns 400 for %s', async (_label, date) => {
      const response = await patch({ date });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('date must be a valid date (YYYY-MM-DD or DD/MM/YYYY)');
      expect(supabase.from).not.toHaveBeenCalled();
    });
  });

  it('returns 400 when no fields are provided', async () => {
    const response = await request(app)
      .patch('/api/v1/receipts/receipt-123')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(response.status).toBe(400);
  });

  it('returns 404 when the receipt does not belong to the user', async () => {
    queueResult({ data: null, error: { message: 'not found' } });

    const response = await request(app)
      .patch('/api/v1/receipts/someone-elses-receipt')
      .set('Authorization', 'Bearer valid-token')
      .send({ merchant: 'Hijacked' });

    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/v1/receipts/:id', () => {
  it('deletes the receipt and its stored image on the happy path', async () => {
    queueResult({ data: { image_path: 'user-123/receipt-123.jpg' }, error: null }); // fetch existing
    queueStorageResult({ error: null }); // storage remove
    queueResult({ error: null, count: 1 }); // delete

    const response = await request(app)
      .delete('/api/v1/receipts/receipt-123')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(204);
  });

  it('deletes the receipt without touching storage when there is no image', async () => {
    queueResult({ data: { image_path: null }, error: null }); // fetch existing
    queueResult({ error: null, count: 1 }); // delete

    const response = await request(app)
      .delete('/api/v1/receipts/receipt-123')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(204);
  });

  it('returns 404 when the receipt does not belong to the user', async () => {
    queueResult({ data: null, error: { message: 'not found' } });

    const response = await request(app)
      .delete('/api/v1/receipts/not-mine')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(404);
  });

  it('returns 401 when Authorization header is missing', async () => {
    const response = await request(app).delete('/api/v1/receipts/receipt-123');

    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/receipts/:id/image-url', () => {
  it('returns a signed URL on the happy path', async () => {
    queueResult({ data: { image_path: 'user-123/receipt-123.jpg' }, error: null }); // fetch existing
    queueStorageResult({ data: { signedUrl: 'https://example.com/signed' }, error: null }); // createSignedUrl

    const response = await request(app)
      .get('/api/v1/receipts/receipt-123/image-url')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.url).toBe('https://example.com/signed');
  });

  it('returns 404 when the receipt has no stored image', async () => {
    queueResult({ data: { image_path: null }, error: null });

    const response = await request(app)
      .get('/api/v1/receipts/receipt-123/image-url')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(404);
  });

  it('returns 404 when the receipt does not belong to the user', async () => {
    queueResult({ data: null, error: { message: 'not found' } });

    const response = await request(app)
      .get('/api/v1/receipts/not-mine/image-url')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(404);
  });

  it('returns 401 when Authorization header is missing', async () => {
    const response = await request(app).get('/api/v1/receipts/receipt-123/image-url');

    expect(response.status).toBe(401);
  });
});

describe('receipts routes — error paths', () => {
  const auth = { Authorization: 'Bearer valid-token' };

  it('scan: 400 for a missing or unsupported mediaType', async () => {
    for (const mediaType of [undefined, 'image/bmp']) {
      const response = await request(app).post('/api/v1/receipts/scan').set(auth).send({ image: 'ZmFrZQ==', mediaType });
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/mediaType/);
    }
    expect(scanReceipt).not.toHaveBeenCalled();
  });

  it('scan: 500 when the receipt row cannot be saved', async () => {
    queueResult({ data: null, error: { message: 'insert failed' } });

    const response = await request(app).post('/api/v1/receipts/scan').set(auth).send({ image: 'ZmFrZQ==', mediaType: 'image/jpeg' });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to save receipt');
  });

  it('scan: still 201 (without image_path) when saving the image path fails', async () => {
    queueResult({ data: SAMPLE_RECEIPT, error: null });
    queueStorageResult({ error: null });
    queueResult({ data: null, error: { message: 'update failed' } });

    const response = await request(app).post('/api/v1/receipts/scan').set(auth).send({ image: 'ZmFrZQ==', mediaType: 'image/jpeg' });

    expect(response.status).toBe(201);
    expect(response.body.receipt.image_path).toBeNull();
  });

  it('list: 500 when the query fails', async () => {
    queueResult({ data: null, error: { message: 'db down' } });
    const response = await request(app).get('/api/v1/receipts').set(auth);
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to fetch receipts');
  });

  it('image-url: 500 when signing fails', async () => {
    queueResult({ data: { image_path: 'user-123/receipt-123.jpg' }, error: null });
    queueStorageResult({ data: null, error: { message: 'sign failed' } });
    const response = await request(app).get('/api/v1/receipts/receipt-123/image-url').set(auth);
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to load receipt image');
  });

  it('delete: 500 when removing the stored image fails (row kept)', async () => {
    queueResult({ data: { image_path: 'user-123/receipt-123.jpg' }, error: null });
    queueStorageResult({ error: { message: 'remove failed' } });
    const response = await request(app).delete('/api/v1/receipts/receipt-123').set(auth);
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to delete receipt image');
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('delete: 500 when deleting the row fails', async () => {
    queueResult({ data: { image_path: null }, error: null });
    queueResult({ error: { message: 'delete failed' }, count: null });
    const response = await request(app).delete('/api/v1/receipts/receipt-123').set(auth);
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to delete receipt');
  });

  it('delete: 404 when no row was deleted', async () => {
    queueResult({ data: { image_path: null }, error: null });
    queueResult({ error: null, count: 0 });
    const response = await request(app).delete('/api/v1/receipts/receipt-123').set(auth);
    expect(response.status).toBe(404);
  });
});
