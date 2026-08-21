import request from 'supertest';

jest.mock('@smartbudget/shared/lib/supabase', () => ({
  supabase: require('../testUtils/supabaseMock').supabase,
}));

jest.mock('@smartbudget/shared/lib/supabaseAuth', () => ({
  supabaseAuth: require('../testUtils/supabaseMock').supabaseAuth,
}));

jest.mock('../services/claude', () => ({
  scanReceipt: jest.fn(async () => ({
    merchant: 'Test Store',
    total: 10,
    date: '2026-01-01',
    items: [],
  })),
  RECEIPT_CATEGORIES: ['Groceries', 'Dining', 'Transport', 'Entertainment', 'Health', 'Other'],
}));

import { app } from '../index';
import { queueResult, queueStorageResult, resetQueue } from '../testUtils/supabaseMock';

const SAMPLE_RECEIPT = {
  id: 'receipt-123',
  user_id: 'user-123',
  raw_response: { merchant: 'Test Store', total: 10, date: '2026-01-01', items: [] },
  created_at: '2026-01-01T00:00:00Z',
  image_path: null,
};

beforeEach(() => {
  resetQueue();
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
