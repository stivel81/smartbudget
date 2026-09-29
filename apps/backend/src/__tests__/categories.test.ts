import request from 'supertest';

jest.mock('@smartbudget/shared/lib/supabase', () => ({
  supabase: require('../testUtils/supabaseMock').supabase,
}));

jest.mock('@smartbudget/shared/lib/supabaseAuth', () => ({
  supabaseAuth: require('../testUtils/supabaseMock').supabaseAuth,
}));

import { app } from '../index';
import { queueResult, resetQueue } from '../testUtils/supabaseMock';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { BASE_CATEGORY_IDS } from '../services/categories';

const USER = 'user-123';
const OWN_ID = 'cccccccc-0000-4000-8000-00000000000a';
const FOREIGN_ID = 'cccccccc-0000-4000-8000-00000000000b';
const MISSING_ID = 'cccccccc-0000-4000-8000-0000000000ff';

const OWN = { id: OWN_ID, user_id: USER, name: 'Pets' };
const FOREIGN = { id: FOREIGN_ID, user_id: 'user-999', name: 'Snacks' };
const BASE_OTHER = { id: BASE_CATEGORY_IDS.Other, user_id: null, name: 'Other' };

const OWN_FULL = {
  ...OWN,
  icon: 'paw',
  color: '#112233',
  is_base: false,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
};

function buildersFor(table: string): any[] {
  const from = supabase.from as jest.Mock;
  return from.mock.calls
    .map((call, i) => (call[0] === table ? from.mock.results[i].value : null))
    .filter(Boolean);
}

const auth = { Authorization: 'Bearer valid-token' };

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  resetQueue();
  jest.clearAllMocks();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe('auth', () => {
  it.each([
    ['get', '/api/v1/categories'],
    ['post', '/api/v1/categories'],
    ['patch', `/api/v1/categories/${OWN_ID}`],
    ['delete', `/api/v1/categories/${OWN_ID}`],
  ])('%s %s returns 401 without a token', async (method, path) => {
    const response = await (request(app) as any)[method](path).send({ name: 'X' });
    expect(response.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/categories', () => {
  it('returns base + own categories with is_base, scoped to the caller', async () => {
    const rows = [{ ...BASE_OTHER, is_base: true }, OWN_FULL];
    queueResult({ data: rows, error: null });

    const response = await request(app).get('/api/v1/categories').set(auth);

    expect(response.status).toBe(200);
    expect(response.body.categories).toEqual(rows);
    const [query] = buildersFor('categories');
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('is_base'));
    expect(query.or).toHaveBeenCalledWith(`user_id.is.null,user_id.eq.${USER}`);
  });

  it('returns 500 on a DB error', async () => {
    queueResult({ data: null, error: { message: 'down' } });
    const response = await request(app).get('/api/v1/categories').set(auth);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to fetch categories', status: 500 });
  });
});

describe('POST /api/v1/categories', () => {
  const post = (body: unknown) => request(app).post('/api/v1/categories').set(auth).send(body as object);

  it('creates a custom category with a trimmed name (201)', async () => {
    queueResult({ data: [], error: null }); // own names
    queueResult({ data: OWN_FULL, error: null }); // insert

    const response = await post({ name: '  Pets  ', icon: 'paw', color: '#112233' });

    expect(response.status).toBe(201);
    expect(response.body.category).toEqual(OWN_FULL);
    const [names, insert] = buildersFor('categories');
    expect(names.eq).toHaveBeenCalledWith('user_id', USER);
    expect(insert.insert).toHaveBeenCalledWith({ user_id: USER, name: 'Pets', icon: 'paw', color: '#112233' });
  });

  it('defaults icon and color to null', async () => {
    queueResult({ data: [], error: null });
    queueResult({ data: OWN_FULL, error: null });

    await post({ name: 'Pets' });

    const [, insert] = buildersFor('categories');
    expect(insert.insert).toHaveBeenCalledWith({ user_id: USER, name: 'Pets', icon: null, color: null });
  });

  it.each([
    [{}, 'missing name'],
    [{ name: '' }, 'empty name'],
    [{ name: '    ' }, 'blank name'],
    [{ name: 'x'.repeat(31) }, '31 characters'],
    [{ name: 42 }, 'non-string name'],
    [{ name: 'Pets', color: 'red' }, 'bad color'],
    [{ name: 'Pets', icon: '' }, 'empty icon'],
    [{ name: 'Pets', icon: 'x'.repeat(65) }, 'long icon'],
    [{ name: 'Pets', user_id: 'user-999' }, 'unknown field user_id'],
    [{ name: 'Pets', is_base: true }, 'unknown field is_base'],
    [[], 'array body'],
  ] as [unknown, string][])('returns 400 for %j (%s) without touching the DB', async (body: unknown, _label: string) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(response.body.status).toBe(400);
    expect(typeof response.body.error).toBe('string');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('accepts exactly 30 characters', async () => {
    queueResult({ data: [], error: null });
    queueResult({ data: OWN_FULL, error: null });
    const response = await post({ name: 'x'.repeat(30) });
    expect(response.status).toBe(201);
  });

  it('returns 409 when the name clashes with a base category (case-insensitive), without a DB call', async () => {
    const response = await post({ name: ' groceries ' });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: '"Groceries" is a built-in category', status: 409 });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('returns 409 when the user already has that name (case-insensitive)', async () => {
    queueResult({ data: [{ id: OWN_ID, name: 'Pets' }], error: null });
    const response = await post({ name: 'PETS' });
    expect(response.status).toBe(409);
    expect(buildersFor('categories')).toHaveLength(1); // no insert
  });

  it('maps a DB unique violation (race / trigger) to 409', async () => {
    queueResult({ data: [], error: null });
    queueResult({ data: null, error: { code: '23505', message: 'duplicate key' } });
    const response = await post({ name: 'Pets' });
    expect(response.status).toBe(409);
  });

  it('returns 500 on other insert errors', async () => {
    queueResult({ data: [], error: null });
    queueResult({ data: null, error: { code: 'XX000', message: 'boom' } });
    const response = await post({ name: 'Pets' });
    expect(response.status).toBe(500);
  });

  it('returns 500 when the name lookup fails', async () => {
    queueResult({ data: null, error: { message: 'down' } });
    const response = await post({ name: 'Pets' });
    expect(response.status).toBe(500);
  });
});

describe('PATCH /api/v1/categories/:id', () => {
  const patch = (id: string, body: unknown) =>
    request(app).patch(`/api/v1/categories/${id}`).set(auth).send(body as object);

  it('renames an own custom category (200)', async () => {
    queueResult({ data: OWN, error: null }); // load
    queueResult({ data: [OWN], error: null }); // own names
    queueResult({ data: { ...OWN_FULL, name: 'Animals' }, error: null }); // update

    const response = await patch(OWN_ID, { name: ' Animals ' });

    expect(response.status).toBe(200);
    expect(response.body.category.name).toBe('Animals');
    const [, , update] = buildersFor('categories');
    expect(update.update).toHaveBeenCalledWith({ name: 'Animals' });
    expect(update.eq).toHaveBeenCalledWith('id', OWN_ID);
    expect(update.eq).toHaveBeenCalledWith('user_id', USER);
  });

  it('allows a case-only rename of itself', async () => {
    queueResult({ data: OWN, error: null });
    queueResult({ data: [OWN], error: null });
    queueResult({ data: { ...OWN_FULL, name: 'PETS' }, error: null });
    const response = await patch(OWN_ID, { name: 'PETS' });
    expect(response.status).toBe(200);
  });

  it('changes only icon/color without a name check', async () => {
    queueResult({ data: OWN, error: null });
    queueResult({ data: { ...OWN_FULL, color: '#000000', icon: null }, error: null });

    const response = await patch(OWN_ID, { color: '#000000', icon: null });

    expect(response.status).toBe(200);
    const [, update] = buildersFor('categories');
    expect(update.update).toHaveBeenCalledWith({ color: '#000000', icon: null });
  });

  it('returns 403 for a base category', async () => {
    queueResult({ data: BASE_OTHER, error: null });
    const response = await patch(BASE_CATEGORY_IDS.Other, { name: 'Misc' });
    expect(response).toMatchObject({ status: 403, body: { error: 'Built-in categories cannot be changed', status: 403 } });
    expect(buildersFor('categories')).toHaveLength(1);
  });

  it("returns 404 for another user's category (no update issued)", async () => {
    queueResult({ data: FOREIGN, error: null });
    const response = await patch(FOREIGN_ID, { name: 'Mine now' });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Category not found', status: 404 });
    expect(buildersFor('categories')).toHaveLength(1);
  });

  it('returns 404 for a missing category', async () => {
    queueResult({ data: null, error: null });
    const response = await patch(MISSING_ID, { name: 'X' });
    expect(response.status).toBe(404);
  });

  it('returns 404 for a non-uuid id without touching the DB', async () => {
    const response = await patch('not-a-uuid', { name: 'X' });
    expect(response.status).toBe(404);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('returns 409 when renaming onto a base name', async () => {
    queueResult({ data: OWN, error: null });
    const response = await patch(OWN_ID, { name: 'health' });
    expect(response.status).toBe(409);
  });

  it('returns 409 when renaming onto another own category name', async () => {
    queueResult({ data: OWN, error: null });
    queueResult({ data: [OWN, { id: 'cccccccc-0000-4000-8000-00000000000c', name: 'Toys' }], error: null });
    const response = await patch(OWN_ID, { name: 'toys' });
    expect(response.status).toBe(409);
  });

  it('maps a DB unique violation to 409', async () => {
    queueResult({ data: OWN, error: null });
    queueResult({ data: [OWN], error: null });
    queueResult({ data: null, error: { code: '23505', message: 'duplicate' } });
    const response = await patch(OWN_ID, { name: 'Animals' });
    expect(response.status).toBe(409);
  });

  it.each([
    [{}, 'empty body'],
    [{ name: '' }, 'empty name'],
    [{ name: 'x'.repeat(31) }, 'long name'],
    [{ color: '#12345' }, 'bad color'],
    [{ user_id: 'user-999' }, 'unknown field'],
  ] as [unknown, string][])('returns 400 for %j (%s) without touching the DB', async (body: unknown, _label: string) => {
    const response = await patch(OWN_ID, body);
    expect(response.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('returns 500 when loading the category fails', async () => {
    queueResult({ data: null, error: { message: 'down' } });
    const response = await patch(OWN_ID, { name: 'X' });
    expect(response.status).toBe(500);
  });
});

describe('DELETE /api/v1/categories/:id', () => {
  const del = (id: string) => request(app).delete(`/api/v1/categories/${id}`).set(auth);

  it('deletes an own custom category via delete_custom_category (reassign to Other + budget cleanup) and returns 204', async () => {
    queueResult({ data: OWN, error: null }); // load
    queueResult({ data: true, error: null }); // rpc

    const response = await del(OWN_ID);

    expect(response.status).toBe(204);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith('delete_custom_category', { p_user_id: USER, p_category_id: OWN_ID });
    // The reassignment happens inside the DB function (one transaction);
    // the route issues no separate table writes.
    expect(buildersFor('transactions')).toHaveLength(0);
    expect(buildersFor('budgets')).toHaveLength(0);
    expect(buildersFor('receipts')).toHaveLength(0);
  });

  it('returns 403 for a base category (no rpc)', async () => {
    queueResult({ data: BASE_OTHER, error: null });
    const response = await del(BASE_CATEGORY_IDS.Other);
    expect(response.status).toBe(403);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("returns 404 for another user's category (no rpc)", async () => {
    queueResult({ data: FOREIGN, error: null });
    const response = await del(FOREIGN_ID);
    expect(response.status).toBe(404);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing category and for a non-uuid id', async () => {
    queueResult({ data: null, error: null });
    expect((await del(MISSING_ID)).status).toBe(404);
    expect((await del('nope')).status).toBe(404);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('returns 404 when the DB function reports nothing deleted (concurrent delete)', async () => {
    queueResult({ data: OWN, error: null });
    queueResult({ data: false, error: null });
    const response = await del(OWN_ID);
    expect(response.status).toBe(404);
  });

  it('returns 500 when the DB function fails (whole transaction rolled back)', async () => {
    queueResult({ data: OWN, error: null });
    queueResult({ data: null, error: { message: 'fk violation' } });
    const response = await del(OWN_ID);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to delete category', status: 500 });
  });
});
