import request from 'supertest';

jest.mock('@smartbudget/shared/lib/supabase', () => ({
  supabase: require('../testUtils/supabaseMock').supabase,
}));

jest.mock('@smartbudget/shared/lib/supabaseAuth', () => ({
  supabaseAuth: require('../testUtils/supabaseMock').supabaseAuth,
}));

import { app } from '../index';
import {
  queueResult,
  queueStorageResult,
  resetQueue,
  mockGetUserById,
  mockUpdateUserById,
  mockDeleteUserAdmin,
} from '../testUtils/supabaseMock';

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

describe('POST /api/v1/admin/users/:id/admin (grant)', () => {
  it('grants admin and writes an audit log entry', async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check
    queueResult({ data: { id: 'user-456', email: 'target@b.com' }, error: null }); // fetch target
    queueResult({ error: null }); // update is_admin=true
    queueResult({ error: null }); // audit log insert

    const response = await request(app)
      .post('/api/v1/admin/users/user-456/admin')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
  });

  it('returns 404 when the target user does not exist', async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check
    queueResult({ data: null, error: { message: 'not found' } }); // fetch target

    const response = await request(app)
      .post('/api/v1/admin/users/does-not-exist/admin')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(404);
  });

  it('returns 403 for a non-admin caller', async () => {
    queueResult({ data: { is_admin: false }, error: null }); // requireAdmin check

    const response = await request(app)
      .post('/api/v1/admin/users/user-456/admin')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(403);
  });
});

describe('DELETE /api/v1/admin/users/:id/admin (revoke)', () => {
  it('revokes admin and writes an audit log entry', async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check
    queueResult({ data: { id: 'user-456', email: 'target@b.com' }, error: null }); // fetch target
    queueResult({ error: null }); // update is_admin=false
    queueResult({ error: null }); // audit log insert

    const response = await request(app)
      .delete('/api/v1/admin/users/user-456/admin')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
  });

  it('returns 400 when an admin tries to revoke their own admin access', async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check

    // requireAuth's mock resolves 'valid-token' to user id 'user-123' —
    // targeting that same id is a self-revoke attempt.
    const response = await request(app)
      .delete('/api/v1/admin/users/user-123/admin')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(400);
  });

  it('returns 404 when the target user does not exist', async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check
    queueResult({ data: null, error: { message: 'not found' } }); // fetch target

    const response = await request(app)
      .delete('/api/v1/admin/users/does-not-exist/admin')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(404);
  });

  it('returns 403 for a non-admin caller', async () => {
    queueResult({ data: { is_admin: false }, error: null }); // requireAdmin check

    const response = await request(app)
      .delete('/api/v1/admin/users/user-456/admin')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(403);
  });
});

describe('POST /api/v1/admin/users/:id/suspend', () => {
  it('suspends the user and writes an audit log entry', async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check
    queueResult({ data: { id: 'user-456', email: 'target@b.com' }, error: null }); // fetch target
    mockUpdateUserById.mockResolvedValueOnce({ data: {}, error: null });
    queueResult({ error: null }); // audit log insert

    const response = await request(app)
      .post('/api/v1/admin/users/user-456/suspend')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(mockUpdateUserById).toHaveBeenCalledWith('user-456', { ban_duration: '876000h' });
  });

  it('returns 400 when an admin tries to suspend their own account', async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check

    const response = await request(app)
      .post('/api/v1/admin/users/user-123/suspend')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(400);
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('returns 404 when the target user does not exist', async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check
    queueResult({ data: null, error: { message: 'not found' } }); // fetch target

    const response = await request(app)
      .post('/api/v1/admin/users/does-not-exist/suspend')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(404);
  });

  it('returns 403 for a non-admin caller', async () => {
    queueResult({ data: { is_admin: false }, error: null }); // requireAdmin check

    const response = await request(app)
      .post('/api/v1/admin/users/user-456/suspend')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(403);
  });
});

describe('POST /api/v1/admin/users/:id/unsuspend', () => {
  it('unsuspends the user and writes an audit log entry', async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check
    queueResult({ data: { id: 'user-456', email: 'target@b.com' }, error: null }); // fetch target
    mockUpdateUserById.mockResolvedValueOnce({ data: {}, error: null });
    queueResult({ error: null }); // audit log insert

    const response = await request(app)
      .post('/api/v1/admin/users/user-456/unsuspend')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(mockUpdateUserById).toHaveBeenCalledWith('user-456', { ban_duration: 'none' });
  });

  it('returns 404 when the target user does not exist', async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check
    queueResult({ data: null, error: { message: 'not found' } }); // fetch target

    const response = await request(app)
      .post('/api/v1/admin/users/does-not-exist/unsuspend')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(404);
  });

  it('returns 403 for a non-admin caller', async () => {
    queueResult({ data: { is_admin: false }, error: null }); // requireAdmin check

    const response = await request(app)
      .post('/api/v1/admin/users/user-456/unsuspend')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(403);
  });
});

describe('DELETE /api/v1/admin/users/:id (right-to-erasure)', () => {
  it('deletes a user with images: audit-logs, removes images, deletes the auth user', async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check
    queueResult({ data: { id: 'user-456', email: 'target@b.com' }, error: null }); // fetch target
    queueResult({ data: [{ image_path: 'user-456/r1.jpg' }, { image_path: null }], error: null }); // receipts select
    queueResult({ error: null }); // audit log insert
    queueStorageResult({ error: null }); // storage remove
    mockDeleteUserAdmin.mockResolvedValueOnce({ data: {}, error: null });

    const response = await request(app)
      .delete('/api/v1/admin/users/user-456')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(mockDeleteUserAdmin).toHaveBeenCalledWith('user-456');
  });

  it('deletes a user with no images without touching storage', async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check
    queueResult({ data: { id: 'user-456', email: 'target@b.com' }, error: null }); // fetch target
    queueResult({ data: [], error: null }); // receipts select — none
    queueResult({ error: null }); // audit log insert
    mockDeleteUserAdmin.mockResolvedValueOnce({ data: {}, error: null });

    const response = await request(app)
      .delete('/api/v1/admin/users/user-456')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
  });

  it('returns 400 when an admin tries to delete their own account', async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check

    const response = await request(app)
      .delete('/api/v1/admin/users/user-123')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(400);
    expect(mockDeleteUserAdmin).not.toHaveBeenCalled();
  });

  it('returns 404 when the target user does not exist', async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check
    queueResult({ data: null, error: { message: 'not found' } }); // fetch target

    const response = await request(app)
      .delete('/api/v1/admin/users/does-not-exist')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(404);
  });

  it('returns 500 and does not delete the auth user if image cleanup fails', async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check
    queueResult({ data: { id: 'user-456', email: 'target@b.com' }, error: null }); // fetch target
    queueResult({ data: [{ image_path: 'user-456/r1.jpg' }], error: null }); // receipts select
    queueResult({ error: null }); // audit log insert
    queueStorageResult({ error: { message: 'storage down' } }); // storage remove fails

    const response = await request(app)
      .delete('/api/v1/admin/users/user-456')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(500);
    expect(mockDeleteUserAdmin).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-admin caller', async () => {
    queueResult({ data: { is_admin: false }, error: null }); // requireAdmin check

    const response = await request(app)
      .delete('/api/v1/admin/users/user-456')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(403);
  });
});

describe('GET /api/v1/admin/users/:id/export', () => {
  it('returns a full data export and writes an audit log entry', async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check
    queueResult({ data: { id: 'user-456', email: 'target@b.com', name: 'Target' }, error: null }); // profile select
    queueResult({ data: [{ id: 'r1', raw_response: { merchant: 'Store', total: 10 } }], error: null }); // receipts select
    queueResult({ data: [{ id: 'b1', category: 'Groceries', monthly_limit: 500 }], error: null }); // budgets select
    queueResult({ error: null }); // audit log insert

    const response = await request(app)
      .get('/api/v1/admin/users/user-456/export')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.profile.email).toBe('target@b.com');
    expect(response.body.receipts).toHaveLength(1);
    expect(response.body.budgets).toHaveLength(1);
    expect(response.body.exportedAt).toBeTruthy();
  });

  it('returns 404 when the target user does not exist', async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check
    queueResult({ data: null, error: { message: 'not found' } }); // profile select

    const response = await request(app)
      .get('/api/v1/admin/users/does-not-exist/export')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(404);
  });

  it('returns 403 for a non-admin caller', async () => {
    queueResult({ data: { is_admin: false }, error: null }); // requireAdmin check

    const response = await request(app)
      .get('/api/v1/admin/users/user-456/export')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(403);
  });
});

describe('GET /api/v1/admin/usage', () => {
  it('aggregates token usage and estimated cost by day', async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check
    queueResult({
      data: [
        {
          created_at: '2026-01-01T10:00:00Z',
          claude_usage: { input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: null, cache_read_input_tokens: null },
        },
        {
          created_at: '2026-01-01T14:00:00Z',
          claude_usage: { input_tokens: 500, output_tokens: 100, cache_creation_input_tokens: null, cache_read_input_tokens: null },
        },
        {
          created_at: '2026-01-02T09:00:00Z',
          claude_usage: { input_tokens: 2000, output_tokens: 400, cache_creation_input_tokens: null, cache_read_input_tokens: null },
        },
      ],
      error: null,
    }); // receipts select

    const response = await request(app)
      .get('/api/v1/admin/usage')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.totalScans).toBe(3);
    expect(response.body.totalInputTokens).toBe(3500);
    expect(response.body.totalOutputTokens).toBe(700);
    // (3500 * $1/1M) + (700 * $5/1M) = 0.0035 + 0.0035 = 0.007
    expect(response.body.estimatedCostUsd).toBeCloseTo(0.007, 6);
    expect(response.body.byDay).toEqual([
      { date: '2026-01-02', scans: 1, inputTokens: 2000, outputTokens: 400 },
      { date: '2026-01-01', scans: 2, inputTokens: 1500, outputTokens: 300 },
    ]);
  });

  it('returns zeroed totals when there are no scans with usage yet', async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check
    queueResult({ data: [], error: null }); // receipts select

    const response = await request(app)
      .get('/api/v1/admin/usage')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.totalScans).toBe(0);
    expect(response.body.estimatedCostUsd).toBe(0);
    expect(response.body.byDay).toEqual([]);
  });

  it('returns 403 for a non-admin caller', async () => {
    queueResult({ data: { is_admin: false }, error: null }); // requireAdmin check

    const response = await request(app).get('/api/v1/admin/usage').set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(403);
  });
});

describe('GET /api/v1/admin/rate-limit-violations', () => {
  it('returns recent violations for an admin caller', async () => {
    queueResult({ data: { is_admin: true }, error: null }); // requireAdmin check
    queueResult({
      data: [{ id: 'v1', ip: '127.0.0.1', route: '/api/v1/auth/login', created_at: '2026-01-01T00:00:00Z' }],
      error: null,
    }); // violations select

    const response = await request(app)
      .get('/api/v1/admin/rate-limit-violations')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.violations).toHaveLength(1);
  });

  it('returns 403 for a non-admin caller', async () => {
    queueResult({ data: { is_admin: false }, error: null }); // requireAdmin check

    const response = await request(app)
      .get('/api/v1/admin/rate-limit-violations')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(403);
  });
});
