// Rate limiting is skipped by default under NODE_ENV=test (see src/index.ts)
// so the rest of the suite isn't request-count-sensitive. Opt back in here
// without touching NODE_ENV, which also gates app.listen() in index.ts.
process.env.TEST_ENABLE_RATE_LIMIT = '1';

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
import { mockGetUser, queueResult } from '../testUtils/supabaseMock';

afterAll(() => {
  delete process.env.TEST_ENABLE_RATE_LIMIT;
});

describe('Rate limiting', () => {
  it('limits repeated login attempts from the same IP', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrong-password' });
      expect(res.status).not.toBe(429);
    }

    const limited = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong-password' });

    expect(limited.status).toBe(429);
  });

  it('limits repeated receipt scans from the same IP, but not other receipt routes', async () => {
    for (let i = 0; i < 30; i++) {
      const res = await request(app)
        .post('/api/v1/receipts/scan')
        .set('Authorization', 'Bearer valid-token')
        .send({ image: 'ZmFrZQ==', mediaType: 'image/jpeg' });
      expect(res.status).not.toBe(429);
    }

    const limited = await request(app)
      .post('/api/v1/receipts/scan')
      .set('Authorization', 'Bearer valid-token')
      .send({ image: 'ZmFrZQ==', mediaType: 'image/jpeg' });

    expect(limited.status).toBe(429);

    // GET /api/v1/receipts shares the /receipts prefix but not the /scan
    // one, so it must not be affected by the scan-specific limiter.
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } }, error: null });
    queueResult({ data: [], error: null });
    const unrelated = await request(app).get('/api/v1/receipts').set('Authorization', 'Bearer valid-token');
    expect(unrelated.status).not.toBe(429);
  });
});
