import request from 'supertest';

jest.mock('@smartbudget/shared/lib/supabase', () => ({
  supabase: require('../testUtils/supabaseMock').supabase,
}));

jest.mock('@smartbudget/shared/lib/supabaseAuth', () => ({
  supabaseAuth: require('../testUtils/supabaseMock').supabaseAuth,
}));

import { app } from '../index';
import { queueResult, resetQueue, mockGetUserById } from '../testUtils/supabaseMock';

beforeEach(() => {
  resetQueue();
  jest.clearAllMocks();
});

describe('GET /api/v1/admin/users', () => {
  it('returns the user list for an admin caller', async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check
    queueResult({
      data: [{ id: 'user-123', email: 'a@b.com', name: 'A', created_at: '2026-01-01', is_admin: true }],
      error: null,
    }); // users select

    const response = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.users).toHaveLength(1);
  });

  it('returns 403 for a non-admin caller', async () => {
    queueResult({ data: { is_admin: false }, error: null }); // requireAdmin check

    const response = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(403);
  });

  it('returns 403 when the caller has no profile row', async () => {
    queueResult({ data: null, error: { message: 'not found' } }); // requireAdmin check

    const response = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(403);
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const response = await request(app).get('/api/v1/admin/users');

    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/admin/users/:id', () => {
  it('returns profile, auth status, and spend/budget summary for an admin caller', async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check
    queueResult({
      data: { id: 'user-456', email: 'target@b.com', name: 'Target', created_at: '2026-01-01', is_admin: false },
      error: null,
    }); // profile select
    mockGetUserById.mockResolvedValueOnce({
      data: { user: { id: 'user-456', email_confirmed_at: '2026-01-02T00:00:00Z', banned_until: null } },
      error: null,
    });
    queueResult({
      data: [{ raw_response: { total: 10 } }, { raw_response: { total: 25.5 } }],
      error: null,
    }); // receipts select
    queueResult({
      data: [{ id: 'b1', category: 'Groceries', monthly_limit: 500 }],
      error: null,
    }); // budgets select

    const response = await request(app)
      .get('/api/v1/admin/users/user-456')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      id: 'user-456',
      email: 'target@b.com',
      email_confirmed_at: '2026-01-02T00:00:00Z',
      banned_until: null,
    });
    expect(response.body.stats).toEqual({ receiptCount: 2, totalSpent: 35.5, budgetCount: 1 });
    expect(response.body.budgets).toHaveLength(1);
  });

  it('returns 404 when the profile row does not exist', async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check
    queueResult({ data: null, error: { message: 'not found' } }); // profile select
    mockGetUserById.mockResolvedValueOnce({ data: { user: { id: 'user-456' } }, error: null });

    const response = await request(app)
      .get('/api/v1/admin/users/does-not-exist')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(404);
  });

  it('returns 403 for a non-admin caller', async () => {
    queueResult({ data: { is_admin: false }, error: null }); // requireAdmin check

    const response = await request(app)
      .get('/api/v1/admin/users/user-456')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(403);
  });
});

describe("GET /api/v1/admin/users/:id/receipts", () => {
  it("returns the target user's receipts for an admin caller", async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check
    queueResult({
      data: [{ id: 'r1', user_id: 'user-456', raw_response: { merchant: 'Store', total: 10 } }],
      error: null,
    }); // receipts select

    const response = await request(app)
      .get('/api/v1/admin/users/user-456/receipts')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.receipts).toHaveLength(1);
  });

  it('returns 403 for a non-admin caller', async () => {
    queueResult({ data: { is_admin: false }, error: null }); // requireAdmin check

    const response = await request(app)
      .get('/api/v1/admin/users/user-456/receipts')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(403);
  });
});
