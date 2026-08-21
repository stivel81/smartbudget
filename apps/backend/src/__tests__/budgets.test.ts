import request from 'supertest';

jest.mock('@smartbudget/shared/lib/supabase', () => ({
  supabase: require('../testUtils/supabaseMock').supabase,
}));

jest.mock('../services/claude', () => ({
  RECEIPT_CATEGORIES: ['Groceries', 'Dining', 'Transport', 'Entertainment', 'Health', 'Other'],
}));

import { app } from '../index';
import { queueResult, resetQueue } from '../testUtils/supabaseMock';

const SAMPLE_BUDGET = {
  id: 'budget-123',
  user_id: 'user-123',
  category: 'Groceries',
  monthly_limit: 1500,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  resetQueue();
});

describe('GET /api/v1/budgets', () => {
  it("returns the current user's budgets on the happy path", async () => {
    queueResult({ data: [SAMPLE_BUDGET], error: null });

    const response = await request(app)
      .get('/api/v1/budgets')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.budgets).toHaveLength(1);
    expect(response.body.budgets[0].category).toBe('Groceries');
  });

  it('returns 401 when Authorization header is missing', async () => {
    const response = await request(app).get('/api/v1/budgets');

    expect(response.status).toBe(401);
  });
});

describe('POST /api/v1/budgets', () => {
  it('creates/updates a budget on the happy path', async () => {
    queueResult({ data: SAMPLE_BUDGET, error: null });

    const response = await request(app)
      .post('/api/v1/budgets')
      .set('Authorization', 'Bearer valid-token')
      .send({ category: 'Groceries', monthlyLimit: 1500 });

    expect(response.status).toBe(200);
    expect(response.body.budget.category).toBe('Groceries');
    expect(response.body.budget.monthly_limit).toBe(1500);
  });

  it('returns 400 for an invalid category', async () => {
    const response = await request(app)
      .post('/api/v1/budgets')
      .set('Authorization', 'Bearer valid-token')
      .send({ category: 'NotACategory', monthlyLimit: 1500 });

    expect(response.status).toBe(400);
  });

  it('returns 400 for a non-positive monthlyLimit', async () => {
    const response = await request(app)
      .post('/api/v1/budgets')
      .set('Authorization', 'Bearer valid-token')
      .send({ category: 'Groceries', monthlyLimit: -5 });

    expect(response.status).toBe(400);
  });

  it('returns 401 when Authorization header is missing', async () => {
    const response = await request(app)
      .post('/api/v1/budgets')
      .send({ category: 'Groceries', monthlyLimit: 1500 });

    expect(response.status).toBe(401);
  });
});

describe('DELETE /api/v1/budgets/:id', () => {
  it('deletes the budget on the happy path', async () => {
    queueResult({ error: null, count: 1 });

    const response = await request(app)
      .delete('/api/v1/budgets/budget-123')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(204);
  });

  it('returns 404 when nothing was deleted', async () => {
    queueResult({ error: null, count: 0 });

    const response = await request(app)
      .delete('/api/v1/budgets/not-mine')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(404);
  });
});
