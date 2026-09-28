// Password-reset routes have their own, stricter per-IP limit (see
// src/index.ts). Rate limiting is skipped under NODE_ENV=test by default;
// opt back in here. Each scenario loads a *fresh* app via isolateModules,
// because the limiters' in-memory counters are per module instance and
// authLimiter (shared by every /auth route) would otherwise carry over.
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

function freshApp(): { app: Express; mock: MockModule; limit: number } {
  let app!: Express;
  let mock!: MockModule;
  let limit!: number;
  jest.isolateModules(() => {
    const index = require('../index');
    app = index.app;
    limit = index.PASSWORD_RESET_LIMIT;
    mock = require('../testUtils/supabaseMock');
  });
  return { app, mock, limit };
}

afterAll(() => {
  delete process.env.TEST_ENABLE_RATE_LIMIT;
});

describe('Password reset rate limiting', () => {
  it('uses a limit stricter than the general auth limit (10)', () => {
    const { limit } = freshApp();
    expect(limit).toBe(5);
  });

  it('returns 429 on forgot-password after 5 attempts from the same IP, and logs the violation', async () => {
    const { app, mock, limit } = freshApp();

    for (let i = 0; i < limit; i++) {
      const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'a@b.com' });
      expect(res.status).toBe(200);
    }
    expect(mock.mockResetPasswordForEmail).toHaveBeenCalledTimes(limit);

    mock.queueResult({ error: null }); // rate_limit_violations insert fired by the 429 handler
    const limited = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'a@b.com' });

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: 'Too many requests, please try again later.', status: 429 });
    // The blocked request never reached Supabase (no extra email sent).
    expect(mock.mockResetPasswordForEmail).toHaveBeenCalledTimes(limit);
    expect(mock.supabase.from).toHaveBeenCalledWith('rate_limit_violations');
  });

  it('returns 429 on reset-password after 5 attempts, counting failed (400) attempts too', async () => {
    const { app, mock, limit } = freshApp();

    for (let i = 0; i < limit; i++) {
      // Wrong-format codes: cheap to send, must still burn the budget.
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ email: 'a@b.com', code: 'nope', newPassword: 'newpassword123' });
      expect(res.status).toBe(400);
    }

    mock.queueResult({ error: null });
    const limited = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ email: 'a@b.com', code: '123456', newPassword: 'newpassword123' });

    expect(limited.status).toBe(429);
    expect(mock.mockVerifyOtp).not.toHaveBeenCalled();
  });

  it('keeps separate budgets: exhausting forgot-password does not block reset-password or login', async () => {
    const { app, mock, limit } = freshApp();

    for (let i = 0; i < limit; i++) {
      await request(app).post('/api/v1/auth/forgot-password').send({ email: 'a@b.com' });
    }
    mock.queueResult({ error: null });
    const limited = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'a@b.com' });
    expect(limited.status).toBe(429);

    mock.mockVerifyOtp.mockResolvedValueOnce({ data: { session: null, user: null }, error: { message: 'bad' } });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ email: 'a@b.com', code: '123456', newPassword: 'newpassword123' });
    warnSpy.mockRestore();
    expect(reset.status).toBe(400);

    mock.mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: 'Invalid login credentials', status: 400 },
    });
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'a@b.com', password: 'wrong-password' });
    expect(login.status).toBe(401);
  });

  it('returns 429 on change-password after 5 attempts (401s count too) and never reaches Supabase', async () => {
    const { app, mock, limit } = freshApp();

    for (let i = 0; i < limit; i++) {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: 'oldpassword123', newPassword: 'newpassword456' });
      expect(res.status).toBe(401); // no token: still burns the budget
    }

    mock.queueResult({ error: null });
    const limited = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', 'Bearer valid-token')
      .send({ currentPassword: 'oldpassword123', newPassword: 'newpassword456' });

    expect(limited.status).toBe(429);
    expect(mock.mockIsolatedSignIn).not.toHaveBeenCalled();
    expect(mock.mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('keeps change-password on its own budget: exhausting it does not block reset-password', async () => {
    const { app, mock, limit } = freshApp();

    for (let i = 0; i < limit; i++) {
      await request(app).post('/api/v1/auth/change-password').send({});
    }
    mock.queueResult({ error: null });
    const limited = await request(app).post('/api/v1/auth/change-password').send({});
    expect(limited.status).toBe(429);

    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ email: 'a@b.com', code: 'nope', newPassword: 'newpassword123' });
    expect(reset.status).toBe(400);
  });

  it('returns 429 on verify-signup after 5 attempts (400s count too) and never reaches Supabase', async () => {
    const { app, mock, limit } = freshApp();

    for (let i = 0; i < limit; i++) {
      const res = await request(app).post('/api/v1/auth/verify-signup').send({ email: 'a@b.com', code: 'nope' });
      expect(res.status).toBe(400);
    }

    mock.queueResult({ error: null });
    const limited = await request(app).post('/api/v1/auth/verify-signup').send({ email: 'a@b.com', code: '123456' });

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: 'Too many requests, please try again later.', status: 429 });
    expect(mock.mockVerifyOtp).not.toHaveBeenCalled();
    expect(mock.supabase.from).toHaveBeenCalledWith('rate_limit_violations');
  });

  it('returns 429 on resend-signup after 5 attempts and sends no extra email', async () => {
    const { app, mock, limit } = freshApp();

    for (let i = 0; i < limit; i++) {
      const res = await request(app).post('/api/v1/auth/resend-signup').send({ email: 'a@b.com' });
      expect(res.status).toBe(200);
    }
    expect(mock.mockResend).toHaveBeenCalledTimes(limit);

    mock.queueResult({ error: null });
    const limited = await request(app).post('/api/v1/auth/resend-signup').send({ email: 'a@b.com' });

    expect(limited.status).toBe(429);
    expect(mock.mockResend).toHaveBeenCalledTimes(limit);
  });

  it('keeps verify-signup and resend-signup on separate budgets from each other and from password reset', async () => {
    const { app, mock, limit } = freshApp();

    for (let i = 0; i < limit; i++) {
      await request(app).post('/api/v1/auth/resend-signup').send({ email: 'a@b.com' });
    }
    mock.queueResult({ error: null });
    expect((await request(app).post('/api/v1/auth/resend-signup').send({ email: 'a@b.com' })).status).toBe(429);

    // Exhausted resend does not block verifying the code already received...
    const verify = await request(app).post('/api/v1/auth/verify-signup').send({ email: 'a@b.com', code: 'nope' });
    expect(verify.status).toBe(400);
    // ...nor asking for a password reset.
    const forgot = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'a@b.com' });
    expect(forgot.status).toBe(200);
  });
});
