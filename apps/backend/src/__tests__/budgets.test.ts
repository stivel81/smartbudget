import request from 'supertest';

jest.mock('@smartbudget/shared/lib/supabase', () => ({
  supabase: require('../testUtils/supabaseMock').supabase,
}));

jest.mock('@smartbudget/shared/lib/supabaseAuth', () => ({
  supabaseAuth: require('../testUtils/supabaseMock').supabaseAuth,
}));

jest.mock('../services/claude', () => ({
  RECEIPT_CATEGORIES: ['Groceries', 'Dining', 'Transport', 'Entertainment', 'Health', 'Other'],
}));

import { app } from '../index';
import { queueResult, resetQueue } from '../testUtils/supabaseMock';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { BASE_CATEGORY_IDS } from '../services/categories';

const SAMPLE_BUDGET = {
  id: 'budget-123',
  user_id: 'user-123',
  category: 'Groceries',
  category_id: '00000000-0000-4000-8000-000000000001',
  monthly_limit: 1500,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  resetQueue();
  jest.clearAllMocks();
});

function buildersFor(table: string): any[] {
  const from = supabase.from as jest.Mock;
  return from.mock.calls
    .map((call, i) => (call[0] === table ? from.mock.results[i].value : null))
    .filter(Boolean);
}

const PETS_ID = 'cccccccc-0000-4000-8000-00000000000a';
const PETS_BUDGET = { ...SAMPLE_BUDGET, id: 'budget-pets', category: 'Pets', category_id: PETS_ID, monthly_limit: 80 };

function postBudget(body: object) {
  return request(app).post('/api/v1/budgets').set('Authorization', 'Bearer valid-token').send(body);
}

function upsertPayload() {
  const [upsert] = buildersFor('budgets');
  return { row: upsert.upsert.mock.calls[0][0], options: upsert.upsert.mock.calls[0][1] };
}

describe('POST /api/v1/budgets with categories', () => {
  it('writes both category and category_id for a base name (no category lookup)', async () => {
    queueResult({ data: SAMPLE_BUDGET, error: null });

    const response = await postBudget({ category: 'Groceries', monthlyLimit: 1500 });

    expect(response.status).toBe(200);
    expect(response.body.budget).toMatchObject({ category: 'Groceries', category_id: BASE_CATEGORY_IDS.Groceries });
    expect(buildersFor('categories')).toHaveLength(0);
    const { row, options } = upsertPayload();
    expect(row).toMatchObject({ user_id: 'user-123', category: 'Groceries', category_id: BASE_CATEGORY_IDS.Groceries, monthly_limit: 1500 });
    expect(options).toEqual({ onConflict: 'user_id,category_id' });
  });

  it('canonicalizes a base name case-insensitively', async () => {
    queueResult({ data: SAMPLE_BUDGET, error: null });
    await postBudget({ category: ' groceries ', monthlyLimit: 1500 });
    expect(upsertPayload().row).toMatchObject({ category: 'Groceries', category_id: BASE_CATEGORY_IDS.Groceries });
  });

  it('accepts a base category_id and fills in the name', async () => {
    queueResult({ data: SAMPLE_BUDGET, error: null });
    const response = await postBudget({ category_id: BASE_CATEGORY_IDS.Groceries, monthlyLimit: 1500 });
    expect(response.status).toBe(200);
    expect(upsertPayload().row).toMatchObject({ category: 'Groceries', category_id: BASE_CATEGORY_IDS.Groceries });
    expect(buildersFor('categories')).toHaveLength(0);
  });

  it("accepts the user's own custom category by name", async () => {
    queueResult({ data: [{ id: PETS_ID, name: 'Pets' }], error: null }); // own categories
    queueResult({ data: PETS_BUDGET, error: null });

    const response = await postBudget({ category: 'pets', monthlyLimit: 80 });

    expect(response.status).toBe(200);
    expect(response.body.budget).toMatchObject({ category: 'Pets', category_id: PETS_ID });
    const [lookup] = buildersFor('categories');
    expect(lookup.eq).toHaveBeenCalledWith('user_id', 'user-123');
    expect(upsertPayload().row).toMatchObject({ category: 'Pets', category_id: PETS_ID });
  });

  it("accepts the user's own custom category by id", async () => {
    queueResult({ data: [{ id: PETS_ID, name: 'Pets' }], error: null });
    queueResult({ data: PETS_BUDGET, error: null });

    const response = await postBudget({ category_id: PETS_ID, monthlyLimit: 80 });

    expect(response.status).toBe(200);
    expect(upsertPayload().row).toMatchObject({ category: 'Pets', category_id: PETS_ID });
  });

  it('accepts matching category and category_id together', async () => {
    queueResult({ data: SAMPLE_BUDGET, error: null });
    const response = await postBudget({ category: 'Groceries', category_id: BASE_CATEGORY_IDS.Groceries, monthlyLimit: 1500 });
    expect(response.status).toBe(200);
  });

  it('returns 400 when category and category_id disagree', async () => {
    const response = await postBudget({ category: 'Groceries', category_id: BASE_CATEGORY_IDS.Dining, monthlyLimit: 1 });
    expect(response.status).toBe(400);
    expect(buildersFor('budgets')).toHaveLength(0);
  });

  it("returns 400 for another user's (or a missing) category_id", async () => {
    queueResult({ data: [], error: null }); // own categories: none
    const response = await postBudget({ category_id: 'cccccccc-0000-4000-8000-00000000000b', monthlyLimit: 1 });
    expect(response).toMatchObject({ status: 400, body: { error: 'Unknown category', status: 400 } });
    expect(buildersFor('budgets')).toHaveLength(0);
  });

  it.each([
    [{ monthlyLimit: 1 }, 'neither category nor category_id'],
    [{ category_id: 'not-a-uuid', monthlyLimit: 1 }, 'non-uuid category_id'],
    [{ category: '', monthlyLimit: 1 }, 'empty category'],
    [{ category: 5, monthlyLimit: 1 }, 'non-string category'],
    [{ category: 'Groceries', monthlyLimit: Infinity }, 'non-finite limit'],
  ] as [object, string][])('returns 400 for %j (%s) without touching the DB', async (body: object, _label: string) => {
    const response = await postBudget(body);
    expect(response.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('returns 500 when the category lookup fails', async () => {
    queueResult({ data: null, error: { message: 'down' } });
    const response = await postBudget({ category: 'Pets', monthlyLimit: 1 });
    expect(response).toMatchObject({ status: 500, body: { error: 'Failed to save budget', status: 500 } });
  });
});

describe('GET /api/v1/budgets includes category_id', () => {
  it('keeps category and adds category_id', async () => {
    queueResult({ data: [SAMPLE_BUDGET, PETS_BUDGET], error: null });
    const response = await request(app).get('/api/v1/budgets').set('Authorization', 'Bearer valid-token');
    expect(response.body.budgets.map((b: any) => [b.category, b.category_id])).toEqual([
      ['Groceries', BASE_CATEGORY_IDS.Groceries],
      ['Pets', PETS_ID],
    ]);
  });
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
    queueResult({ data: [], error: null }); // user's custom categories: none match

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
