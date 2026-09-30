// The app's limiters wired to the Postgres store (RATE_LIMIT_STORE=postgres):
// the counter comes from the RPC, and a failing store fails OPEN.
process.env.TEST_ENABLE_RATE_LIMIT = '1';
process.env.RATE_LIMIT_STORE = 'postgres';

const mockRpc = jest.fn();
const mockInsert = jest.fn(() => ({ then: (resolve: (v: unknown) => void) => resolve({ error: null }) }));
jest.mock('@smartbudget/shared/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: jest.fn(() => ({ insert: mockInsert })),
    auth: { getUser: jest.fn() },
  },
}));
jest.mock('@smartbudget/shared/lib/supabaseAuth', () => ({
  supabaseAuth: {},
  createIsolatedAuthClient: jest.fn(),
}));
jest.mock('../services/claude', () => ({ scanReceipt: jest.fn(), RECEIPT_CATEGORIES: [] }));

import request from 'supertest';
import { app, AUTH_LIMIT, RATE_LIMIT_STORE } from '../index';

afterAll(() => {
  delete process.env.TEST_ENABLE_RATE_LIMIT;
  delete process.env.RATE_LIMIT_STORE;
});

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  mockRpc.mockReset();
  mockInsert.mockClear();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

const login = () => request(app).post('/api/v1/auth/login').send({});

it('uses the Postgres store', () => {
  expect(RATE_LIMIT_STORE).toBe('postgres');
});

it('enforces the login limit from the shared counter', async () => {
  let hits = 0;
  mockRpc.mockImplementation(async (fn: string, args: { p_key: string }) => {
    expect(fn).toBe('rate_limit_increment');
    expect(args.p_key).toMatch(/^auth:/);
    hits += 1;
    return { data: [{ total_hits: hits, reset_time: new Date(Date.now() + 60_000).toISOString() }], error: null };
  });

  for (let i = 0; i < AUTH_LIMIT; i++) expect((await login()).status).toBe(400);
  const limited = await login();
  expect(limited.status).toBe(429);
  expect(limited.body).toEqual({ error: 'Too many requests, please try again later.', status: 429 });
});

it('another instance already at the limit blocks this one (counter is shared)', async () => {
  mockRpc.mockResolvedValue({ data: [{ total_hits: AUTH_LIMIT + 1, reset_time: new Date(Date.now() + 60_000).toISOString() }], error: null });
  expect((await login()).status).toBe(429);
});

it('FAILS OPEN when the store errors: requests pass, the failure is logged', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'db down' } });

  for (let i = 0; i < AUTH_LIMIT + 5; i++) {
    expect((await login()).status).toBe(400); // reached the route, never 429 or 500
  }
  expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/FAILING OPEN.*db down/));
});
