import request from 'supertest';

jest.mock('@smartbudget/shared/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(async (token: string) => {
        if (token === 'valid-token') {
          return { data: { user: { id: 'user-123' } }, error: null };
        }
        return { data: { user: null }, error: { message: 'Invalid token' } };
      }),
    },
    from: jest.fn(() => ({
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(async () => ({
            data: {
              id: 'receipt-123',
              user_id: 'user-123',
              raw_response: { merchant: 'Test Store', total: 10, date: '2026-01-01', items: [] },
              created_at: '2026-01-01T00:00:00Z',
            },
            error: null,
          })),
        })),
      })),
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          order: jest.fn(async () => ({
            data: [
              {
                id: 'receipt-123',
                user_id: 'user-123',
                raw_response: { merchant: 'Test Store', total: 10, date: '2026-01-01', items: [] },
                created_at: '2026-01-01T00:00:00Z',
              },
            ],
            error: null,
          })),
        })),
      })),
    })),
  },
}));

jest.mock('../services/claude', () => ({
  scanReceipt: jest.fn(async () => ({
    merchant: 'Test Store',
    total: 10,
    date: '2026-01-01',
    items: [],
  })),
}));

import { app } from '../index';

describe('POST /api/v1/receipts/scan', () => {
  it('scans a receipt and returns 201 on the happy path', async () => {
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
  it('returns the current user\'s receipts on the happy path', async () => {
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
