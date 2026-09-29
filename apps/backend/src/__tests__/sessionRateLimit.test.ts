// Per-route auth rate limits (see src/index.ts): login/signup share the
// tight authLimiter (credential guessing); session upkeep — /refresh and
// /logout — each get their own generous budget, so an app keeping its
// session alive (or many devices behind one carrier IP) can't be locked
// out by, or lock out, sign-in attempts.
//
// Rate limiting is skipped under NODE_ENV=test by default; opt back in here.
// Each scenario loads a *fresh* app via isolateModules, because the
// limiters' in-memory counters are per module instance.
process.env.TEST_ENABLE_RATE_LIMIT = '1';

import request from 'supertest';
import type { Express } from 'express';

jest.mock('@smartbudget/shared/lib/supabase', () => ({
  supabase: require('../testUtils/supabaseMock').supabase,
}));

jest.mock('@smartbudget/shared/lib/supabaseAuth', () => ({
  supabaseAuth: require('../testUtils/supabaseMock').supabaseAuth,
  createIsolatedAuthClient: require('../testUtils/supabaseMock').createIsolatedAuthClient,
}));

type MockModule = typeof import('../testUtils/supabaseMock');

function freshApp(): { app: Express; mock: MockModule; authLimit: number; sessionLimit: number } {
  let app!: Express;
  let mock!: MockModule;
  let authLimit!: number;
  let sessionLimit!: number;
  jest.isolateModules(() => {
    const index = require('../index');
    app = index.app;
    authLimit = index.AUTH_LIMIT;
    sessionLimit = index.SESSION_LIMIT;
    mock = require('../testUtils/supabaseMock');
  });

  // Happy-path Supabase answers for the routes exercised below.
  mock.mockSignInWithPassword.mockReset();
  mock.mockSignInWithPassword.mockResolvedValue({
    data: { session: null, user: null },
    error: { message: 'Invalid login credentials', status: 400 },
  });
  mock.mockRefreshSession.mockReset();
  mock.mockRefreshSession.mockResolvedValue({
    data: { session: { access_token: 'acc', refresh_token: 'ref', expires_in: 3600 }, user: { id: 'u1', email: 'a@b.com' } },
    error: null,
  });
  mock.mockAdminSignOut.mockReset();
  mock.mockAdminSignOut.mockResolvedValue({ data: null, error: null });
  return { app, mock, authLimit, sessionLimit };
}

const login = (app: Express) => request(app).post('/api/v1/auth/login').send({ email: 'a@b.com', password: 'wrong-password' });
const refresh = (app: Express) => request(app).post('/api/v1/auth/refresh').send({ refresh_token: 'ref' });
const logout = (app: Express) =>
  request(app).post('/api/v1/auth/logout').set('Authorization', 'Bearer valid-token').send({ refresh_token: 'ref' });

async function exhaust(app: Express, mock: MockModule, call: (a: Express) => request.Test, limit: number) {
  for (let i = 0; i < limit; i++) {
    const res = await call(app);
    expect(res.status).not.toBe(429);
  }
  mock.queueResult({ error: null }); // rate_limit_violations insert fired by the 429 handler
  const limited = await call(app);
  expect(limited.status).toBe(429);
}

afterAll(() => {
  delete process.env.TEST_ENABLE_RATE_LIMIT;
});

describe('Auth rate limits per route', () => {
  it('limits: 10 per 15 min for login/signup, 60 per 15 min for session upkeep', () => {
    const { authLimit, sessionLimit } = freshApp();
    expect(authLimit).toBe(10);
    expect(sessionLimit).toBe(60);
  });

  it('an exhausted login bucket does not block /refresh or /logout', async () => {
    const { app, mock, authLimit } = freshApp();
    await exhaust(app, mock, login, authLimit);

    const refreshed = await refresh(app);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.session.access_token).toBe('acc');

    const loggedOut = await logout(app);
    expect(loggedOut.status).toBe(200);
  });

  it('login and signup still share the 10/15min bucket', async () => {
    const { app, mock, authLimit } = freshApp();
    await exhaust(app, mock, login, authLimit);

    mock.queueResult({ error: null });
    const signup = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'new@example.com', password: 'password123', name: 'N' });
    expect(signup.status).toBe(429);
    expect(mock.mockSignUp).not.toHaveBeenCalled();
  });

  it('/refresh gets 429 only at its own threshold (60), and the blocked call never reaches Supabase', async () => {
    const { app, mock, sessionLimit } = freshApp();

    await exhaust(app, mock, refresh, sessionLimit);

    expect(mock.mockRefreshSession).toHaveBeenCalledTimes(sessionLimit);
    expect(mock.supabase.from).toHaveBeenCalledWith('rate_limit_violations');
  });

  it('refresh traffic does not eat into the login bucket', async () => {
    const { app, mock, sessionLimit, authLimit } = freshApp();
    for (let i = 0; i < sessionLimit; i++) {
      expect((await refresh(app)).status).toBe(200);
    }

    for (let i = 0; i < authLimit; i++) {
      expect((await login(app)).status).toBe(401); // wrong password, not 429
    }
    expect(mock.mockSignInWithPassword).toHaveBeenCalledTimes(authLimit);
  });

  it('/logout has its own budget (60), separate from /refresh', async () => {
    const { app, mock, sessionLimit } = freshApp();

    await exhaust(app, mock, refresh, sessionLimit);
    expect((await logout(app)).status).toBe(200);

    const fresh = freshApp();
    await exhaust(fresh.app, fresh.mock, logout, fresh.sessionLimit);
    expect(fresh.mock.mockAdminSignOut).toHaveBeenCalledTimes(fresh.sessionLimit);
    expect((await refresh(fresh.app)).status).toBe(200);
  });

  it('the logout refresh-token fallback (expired access token) is rate limited the same way', async () => {
    const { app, mock, sessionLimit } = freshApp();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mock.mockAdminSignOut.mockResolvedValue({ data: null, error: { message: 'token is expired' } });
    mock.mockIsolatedRefreshSession.mockReset();
    mock.mockIsolatedRefreshSession.mockResolvedValue({
      data: { session: { access_token: 'fresh', refresh_token: 'rot' }, user: { id: 'u1' } },
      error: null,
    });

    await exhaust(app, mock, logout, sessionLimit);

    expect(mock.mockIsolatedRefreshSession).toHaveBeenCalledTimes(sessionLimit);
    mock.mockIsolatedRefreshSession.mockReset();
    warnSpy.mockRestore();
  });

  it('password-reset routes keep their own 5/15min budget and no longer eat into login', async () => {
    const { app, mock, authLimit } = freshApp();
    for (let i = 0; i < 5; i++) {
      expect((await request(app).post('/api/v1/auth/forgot-password').send({ email: 'a@b.com' })).status).toBe(200);
    }
    mock.queueResult({ error: null });
    expect((await request(app).post('/api/v1/auth/forgot-password').send({ email: 'a@b.com' })).status).toBe(429);

    for (let i = 0; i < authLimit; i++) {
      expect((await login(app)).status).toBe(401);
    }
  });
});
