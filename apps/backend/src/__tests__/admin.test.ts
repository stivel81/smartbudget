import request from 'supertest';

jest.mock('@smartbudget/shared/lib/supabase', () => ({
  supabase: require('../testUtils/supabaseMock').supabase,
}));

jest.mock('@smartbudget/shared/lib/supabaseAuth', () => ({
  supabaseAuth: require('../testUtils/supabaseMock').supabaseAuth,
}));

import { app } from '../index';
import { queueResult, resetQueue } from '../testUtils/supabaseMock';

beforeEach(() => {
  resetQueue();
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
