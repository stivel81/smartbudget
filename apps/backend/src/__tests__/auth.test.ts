import request from 'supertest';

jest.mock('@smartbudget/shared/lib/supabase', () => ({
  supabase: require('../testUtils/supabaseMock').supabase,
}));

jest.mock('@smartbudget/shared/lib/supabaseAuth', () => ({
  supabaseAuth: require('../testUtils/supabaseMock').supabaseAuth,
  createIsolatedAuthClient: require('../testUtils/supabaseMock').createIsolatedAuthClient,
}));

import { app } from '../index';
import {
  mockSignUp,
  mockSignInWithPassword,
  mockRefreshSession,
  mockAdminSignOut,
  mockResetPasswordForEmail,
  mockVerifyOtp,
  mockUpdateUser,
  createIsolatedAuthClient,
  isolatedClients,
  mockIsolatedSignIn,
  mockIsolatedAdminSignOut,
  mockUpdateUserById,
  mockGetUser,
} from '../testUtils/supabaseMock';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/v1/auth/signup', () => {
  it('creates a pending (unconfirmed) account on the happy path', async () => {
    mockSignUp.mockResolvedValue({
      data: {
        user: { id: 'user-1', email: 'new@example.com', identities: [{ id: 'ident-1' }] },
        session: null,
      },
      error: null,
    });

    const response = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'new@example.com', password: 'password123', name: 'New User' });

    expect(response.status).toBe(201);
    expect(response.body.user).toEqual({ id: 'user-1', email: 'new@example.com' });
    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'password123',
      options: { data: { name: 'New User' } },
    });
  });

  it('returns 400 when the email is already registered (empty identities)', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'dup@example.com', identities: [] }, session: null },
      error: null,
    });

    const response = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'dup@example.com', password: 'password123', name: 'Dup' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/already registered/i);
  });

  it('returns 400 when Supabase reports the email is already registered', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'User already exists' },
    });

    const response = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'dup@example.com', password: 'password123', name: 'Dup' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/already registered/i);
  });

  it('returns 400 for a missing field', async () => {
    const response = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'a@b.com', password: 'password123' });

    expect(response.status).toBe(400);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid email', async () => {
    const response = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'not-an-email', password: 'password123', name: 'A' });

    expect(response.status).toBe(400);
  });

  it('returns 400 for a short password', async () => {
    const response = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'a@b.com', password: 'short', name: 'A' });

    expect(response.status).toBe(400);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('returns a session on the happy path', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: {
        session: { access_token: 'tok', refresh_token: 'ref' },
        user: { id: 'user-1', email: 'a@b.com' },
      },
      error: null,
    });

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.com', password: 'password123' });

    expect(response.status).toBe(200);
    expect(response.body.session.access_token).toBe('tok');
  });

  it('returns 401 with a clear message when the email is unconfirmed', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Email not confirmed', status: 400 },
    });

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.com', password: 'password123' });

    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/verify your email/i);
  });

  it('returns 403 with a clear message when the account is suspended', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'User is banned', status: 400, code: 'user_banned' },
    });

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.com', password: 'password123' });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/suspended/i);
  });

  it('returns 401 for invalid credentials', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Invalid login credentials', status: 400 },
    });

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.com', password: 'wrong' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid email or password');
  });

  it('returns 400 when a field is missing', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({ email: 'a@b.com' });

    expect(response.status).toBe(400);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('returns a new session on the happy path', async () => {
    mockRefreshSession.mockResolvedValue({
      data: {
        session: { access_token: 'new-tok', refresh_token: 'new-ref' },
        user: { id: 'user-1', email: 'a@b.com' },
      },
      error: null,
    });

    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: 'old-ref' });

    expect(response.status).toBe(200);
    expect(response.body.session).toEqual({
      access_token: 'new-tok',
      refresh_token: 'new-ref',
      user: { id: 'user-1', email: 'a@b.com' },
    });
    expect(mockRefreshSession).toHaveBeenCalledWith({ refresh_token: 'old-ref' });
  });

  it('returns 401 for an invalid or expired refresh token', async () => {
    mockRefreshSession.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Invalid Refresh Token' },
    });

    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: 'expired-ref' });

    expect(response.status).toBe(401);
  });

  it('returns 400 when refresh_token is missing', async () => {
    const response = await request(app).post('/api/v1/auth/refresh').send({});

    expect(response.status).toBe(400);
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('signs out on the happy path', async () => {
    mockAdminSignOut.mockResolvedValue({ error: null });

    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
  });

  it('returns 400 when the Authorization header is missing', async () => {
    const response = await request(app).post('/api/v1/auth/logout');

    expect(response.status).toBe(400);
    expect(mockAdminSignOut).not.toHaveBeenCalled();
  });
});

const FORGOT_OK = 'If an account exists for that email, a 6-digit reset code has been sent.';

describe('POST /api/v1/auth/forgot-password', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('sends the reset email and returns the generic 200 for a known account', async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });

    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'known@example.com' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: FORGOT_OK });
    expect(mockResetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith('known@example.com');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('trims surrounding whitespace from the email before sending', async () => {
    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: '  known@example.com  ' });

    expect(response.status).toBe(200);
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith('known@example.com');
  });

  it('returns the identical generic 200 for an unknown email (no enumeration)', async () => {
    // Supabase itself returns success for unknown emails by default.
    mockResetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    const known = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'known@example.com' });

    mockResetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    const unknown = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'nobody@example.com' });

    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
  });

  it('still returns the generic 200 when Supabase reports "user not found", and logs it', async () => {
    const supaError = { message: 'User not found', status: 404, code: 'user_not_found' };
    mockResetPasswordForEmail.mockResolvedValueOnce({ data: null, error: supaError });

    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@example.com' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: FORGOT_OK });
    expect(JSON.stringify(response.body)).not.toMatch(/not found/i);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Forgot password'), supaError);
  });

  it('still returns the generic 200 when Supabase rate-limits emails, and logs it', async () => {
    const supaError = { message: 'Email rate limit exceeded', status: 429, code: 'over_email_send_rate_limit' };
    mockResetPasswordForEmail.mockResolvedValueOnce({ data: null, error: supaError });

    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'a@b.com' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: FORGOT_OK });
    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), supaError);
  });

  it('still returns the generic 200 when the Supabase call throws, and logs it', async () => {
    const thrown = new Error('ECONNRESET');
    mockResetPasswordForEmail.mockRejectedValueOnce(thrown);

    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'a@b.com' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: FORGOT_OK });
    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), thrown);
  });

  it.each([
    ['missing', {}],
    ['empty', { email: '' }],
    ['whitespace-only', { email: '   ' }],
    ['non-string', { email: 12345 }],
  ])('returns 400 when the email is %s', async (_label, body) => {
    const response = await request(app).post('/api/v1/auth/forgot-password').send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Missing required field: email', status: 400 });
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });

  it.each(['not-an-email', 'a@b', '@b.com', 'a b@c.com'])(
    'returns 400 for the malformed email %p',
    async (email) => {
      const response = await request(app).post('/api/v1/auth/forgot-password').send({ email });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid email format', status: 400 });
      expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
    }
  );
});

describe('POST /api/v1/auth/reset-password', () => {
  const validBody = { email: 'a@b.com', code: '123456', newPassword: 'newpassword123' };
  const recoverySession = { access_token: 'recovery-access', refresh_token: 'recovery-refresh' };
  const recoveryUser = { id: 'user-1', email: 'a@b.com' };
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    isolatedClients.length = 0;
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  function mockVerifySuccess() {
    mockVerifyOtp.mockResolvedValueOnce({
      data: { session: recoverySession, user: recoveryUser },
      error: null,
    });
  }

  it('verifies the code, updates the password, and returns a login-shaped session', async () => {
    mockVerifySuccess();
    mockUpdateUser.mockResolvedValueOnce({ data: { user: recoveryUser }, error: null });

    const response = await request(app).post('/api/v1/auth/reset-password').send(validBody);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      session: {
        access_token: 'recovery-access',
        refresh_token: 'recovery-refresh',
        user: { id: 'user-1', email: 'a@b.com' },
      },
    });
    expect(mockVerifyOtp).toHaveBeenCalledWith({ email: 'a@b.com', token: '123456', type: 'recovery' });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpassword123' });
  });

  it('runs verifyOtp and updateUser on one fresh client per request, never the shared one', async () => {
    mockVerifySuccess();
    mockUpdateUser.mockResolvedValueOnce({ data: { user: recoveryUser }, error: null });
    mockVerifySuccess();
    mockUpdateUser.mockResolvedValueOnce({ data: { user: recoveryUser }, error: null });

    await request(app).post('/api/v1/auth/reset-password').send(validBody);
    await request(app).post('/api/v1/auth/reset-password').send(validBody);

    expect(createIsolatedAuthClient).toHaveBeenCalledTimes(2);
    expect(isolatedClients).toHaveLength(2);
    expect(isolatedClients[0]).not.toBe(isolatedClients[1]);
    for (const client of isolatedClients) {
      // updateUser must act on the session held by the *same* client that verified the code.
      expect(client.auth.verifyOtp).toHaveBeenCalledTimes(1);
      expect(client.auth.updateUser).toHaveBeenCalledTimes(1);
    }
  });

  it('trims the email and code', async () => {
    mockVerifySuccess();
    mockUpdateUser.mockResolvedValueOnce({ data: { user: recoveryUser }, error: null });

    const response = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ email: ' a@b.com ', code: ' 123456 ', newPassword: 'newpassword123' });

    expect(response.status).toBe(200);
    expect(mockVerifyOtp).toHaveBeenCalledWith({ email: 'a@b.com', token: '123456', type: 'recovery' });
  });

  it('returns 400 "Invalid or expired code" for a wrong code and never updates the password', async () => {
    mockVerifyOtp.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: 'Token has expired or is invalid', status: 403, code: 'otp_expired' },
    });

    const response = await request(app).post('/api/v1/auth/reset-password').send(validBody);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid or expired code', status: 400 });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('returns 400 "Invalid or expired code" when verifyOtp yields no session', async () => {
    mockVerifyOtp.mockResolvedValueOnce({ data: { session: null, user: recoveryUser }, error: null });

    const response = await request(app).post('/api/v1/auth/reset-password').send(validBody);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid or expired code');
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('returns 500 when updateUser fails unexpectedly, without returning a session', async () => {
    mockVerifySuccess();
    mockUpdateUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Database error', status: 500, code: 'unexpected_failure' },
    });

    const response = await request(app).post('/api/v1/auth/reset-password').send(validBody);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to update password', status: 500 });
    expect(response.body.session).toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });

  it.each(['same_password', 'weak_password'])(
    'returns 400 with Supabase\'s message when updateUser rejects with %s',
    async (code) => {
      mockVerifySuccess();
      mockUpdateUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Password rejected by policy', status: 422, code },
      });

      const response = await request(app).post('/api/v1/auth/reset-password').send(validBody);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Password rejected by policy', status: 400 });
    }
  );

  it('returns 500 when verifyOtp throws', async () => {
    mockVerifyOtp.mockRejectedValueOnce(new Error('network down'));

    const response = await request(app).post('/api/v1/auth/reset-password').send(validBody);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error', status: 500 });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it.each([
    ['email', { code: '123456', newPassword: 'newpassword123' }],
    ['code', { email: 'a@b.com', newPassword: 'newpassword123' }],
    ['newPassword', { email: 'a@b.com', code: '123456' }],
    ['all fields', {}],
    ['non-string code', { email: 'a@b.com', code: 123456, newPassword: 'newpassword123' }],
    ['blank email', { email: '  ', code: '123456', newPassword: 'newpassword123' }],
  ])('returns 400 when %s is missing/invalid type', async (_label, body) => {
    const response = await request(app).post('/api/v1/auth/reset-password').send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Missing required fields: email, code, newPassword', status: 400 });
    expect(createIsolatedAuthClient).not.toHaveBeenCalled();
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed email', async () => {
    const response = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ ...validBody, email: 'not-an-email' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid email format');
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it.each(['12345', '1234567', '12a456', 'abcdef', '12 456'])(
    'returns 400 for the malformed code %p without calling Supabase',
    async (code) => {
      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ ...validBody, code });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Code must be 6 digits');
      expect(mockVerifyOtp).not.toHaveBeenCalled();
    }
  );

  it('rejects a new password that breaks the signup rules, with the exact signup message', async () => {
    const signupRes = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'a@b.com', password: 'short', name: 'A' });
    const resetRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ ...validBody, newPassword: 'short' });

    expect(resetRes.status).toBe(400);
    expect(resetRes.body.error).toBe('Password must be at least 8 characters long');
    expect(resetRes.body.error).toBe(signupRes.body.error);
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it('accepts a password of exactly the minimum length', async () => {
    mockVerifySuccess();
    mockUpdateUser.mockResolvedValueOnce({ data: { user: recoveryUser }, error: null });

    const response = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ ...validBody, newPassword: '12345678' });

    expect(response.status).toBe(200);
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: '12345678' });
  });
});

describe('POST /api/v1/auth/change-password', () => {
  const validBody = { currentPassword: 'oldpassword123', newPassword: 'newpassword456' };
  // requireAuth's mock resolves 'valid-token' to this user.
  const tokenUser = { id: 'user-123', email: 'user@example.com' };
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    isolatedClients.length = 0;
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  function post(body: unknown, token: string | null = 'valid-token') {
    const req = request(app).post('/api/v1/auth/change-password');
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(body as object);
  }

  function mockCurrentPasswordOk(user: { id: string; email: string } = tokenUser) {
    mockIsolatedSignIn.mockResolvedValueOnce({
      data: { session: { access_token: 'verify-access', refresh_token: 'verify-refresh' }, user },
      error: null,
    });
  }

  function mockWrongCurrentPassword() {
    mockIsolatedSignIn.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: 'Invalid login credentials', status: 400, code: 'invalid_credentials' },
    });
  }

  it('verifies the current password, updates it via the admin API, and returns 200', async () => {
    mockCurrentPasswordOk();
    mockUpdateUserById.mockResolvedValueOnce({ data: { user: tokenUser }, error: null });

    const response = await post(validBody);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Password updated' });
    // Email comes from the verified token, never from the request body.
    expect(mockIsolatedSignIn).toHaveBeenCalledWith({ email: 'user@example.com', password: 'oldpassword123' });
    expect(mockUpdateUserById).toHaveBeenCalledTimes(1);
    expect(mockUpdateUserById).toHaveBeenCalledWith('user-123', { password: 'newpassword456' });
  });

  it('ignores an email supplied in the body (cannot target another account)', async () => {
    mockCurrentPasswordOk();
    mockUpdateUserById.mockResolvedValueOnce({ data: { user: tokenUser }, error: null });

    const response = await post({ ...validBody, email: 'victim@example.com', userId: 'victim-id' });

    expect(response.status).toBe(200);
    expect(mockIsolatedSignIn).toHaveBeenCalledWith({ email: 'user@example.com', password: 'oldpassword123' });
    expect(mockUpdateUserById).toHaveBeenCalledWith('user-123', { password: 'newpassword456' });
  });

  it('verifies on one fresh isolated client per request, never the shared auth client', async () => {
    mockCurrentPasswordOk();
    mockUpdateUserById.mockResolvedValueOnce({ data: { user: tokenUser }, error: null });
    mockCurrentPasswordOk();
    mockUpdateUserById.mockResolvedValueOnce({ data: { user: tokenUser }, error: null });

    await post(validBody);
    await post(validBody);

    expect(createIsolatedAuthClient).toHaveBeenCalledTimes(2);
    expect(isolatedClients).toHaveLength(2);
    expect(isolatedClients[0]).not.toBe(isolatedClients[1]);
    for (const client of isolatedClients) {
      expect(client.auth.signInWithPassword).toHaveBeenCalledTimes(1);
    }
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("revokes only the verification session (scope 'local'), not the user's other sessions", async () => {
    mockCurrentPasswordOk();
    mockUpdateUserById.mockResolvedValueOnce({ data: { user: tokenUser }, error: null });

    await post(validBody);

    expect(mockIsolatedAdminSignOut).toHaveBeenCalledWith('verify-access', 'local');
    expect(mockAdminSignOut).not.toHaveBeenCalled();
  });

  it('still changes the password when revoking the verification session fails', async () => {
    mockCurrentPasswordOk();
    mockIsolatedAdminSignOut.mockResolvedValueOnce({ data: {}, error: { message: 'nope' } });
    mockUpdateUserById.mockResolvedValueOnce({ data: { user: tokenUser }, error: null });

    const response = await post(validBody);

    expect(response.status).toBe(200);
    expect(mockUpdateUserById).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('skips the revoke call when sign-in returned no session', async () => {
    mockIsolatedSignIn.mockResolvedValueOnce({ data: { session: null, user: tokenUser }, error: null });
    mockUpdateUserById.mockResolvedValueOnce({ data: { user: tokenUser }, error: null });

    const response = await post(validBody);

    expect(response.status).toBe(200);
    expect(mockIsolatedAdminSignOut).not.toHaveBeenCalled();
  });

  it('returns 400 "Current password is incorrect" for a wrong current password, and does not update', async () => {
    mockWrongCurrentPassword();

    const response = await post(validBody);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Current password is incorrect', status: 400 });
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('recognises a wrong password by message alone (older GoTrue without error codes)', async () => {
    mockIsolatedSignIn.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: 'Invalid login credentials', status: 400 },
    });

    const response = await post(validBody);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Current password is incorrect');
  });

  it('returns 500 (not "incorrect password") when verification fails for another reason', async () => {
    mockIsolatedSignIn.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: 'Service unavailable', status: 503 },
    });

    const response = await post(validBody);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to change password', status: 500 });
    expect(response.body.error).not.toMatch(/unavailable/i);
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('returns 500 and does not update when the verified user is not the token user', async () => {
    mockCurrentPasswordOk({ id: 'someone-else', email: 'user@example.com' });

    const response = await post(validBody);

    expect(response.status).toBe(500);
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('returns 500 when the token user has no email', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } }, error: null });

    const response = await post(validBody);

    expect(response.status).toBe(500);
    expect(createIsolatedAuthClient).not.toHaveBeenCalled();
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('returns 400 when the new password equals the current one, without calling Supabase', async () => {
    const response = await post({ currentPassword: 'samepassword1', newPassword: 'samepassword1' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('New password must be different from your current password');
    expect(mockIsolatedSignIn).not.toHaveBeenCalled();
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('rejects a new password that breaks the signup rules, with the exact signup message', async () => {
    const signupRes = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'a@b.com', password: 'short', name: 'A' });
    const response = await post({ ...validBody, newPassword: 'short' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Password must be at least 8 characters long');
    expect(response.body.error).toBe(signupRes.body.error);
    expect(mockIsolatedSignIn).not.toHaveBeenCalled();
  });

  it('accepts a new password of exactly the minimum length', async () => {
    mockCurrentPasswordOk();
    mockUpdateUserById.mockResolvedValueOnce({ data: { user: tokenUser }, error: null });

    const response = await post({ ...validBody, newPassword: '12345678' });

    expect(response.status).toBe(200);
  });

  it.each([
    ['missing currentPassword', { newPassword: 'newpassword456' }],
    ['missing newPassword', { currentPassword: 'oldpassword123' }],
    ['empty currentPassword', { currentPassword: '', newPassword: 'newpassword456' }],
    ['empty newPassword', { currentPassword: 'oldpassword123', newPassword: '' }],
    ['non-string currentPassword', { currentPassword: 12345678, newPassword: 'newpassword456' }],
    ['non-string newPassword', { currentPassword: 'oldpassword123', newPassword: ['x'] }],
  ])('returns 400 for %s', async (_label, body) => {
    const response = await post(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Missing required fields: currentPassword, newPassword');
    expect(mockIsolatedSignIn).not.toHaveBeenCalled();
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it.each([
    ['same_password', 'New password should be different from the old password.'],
    ['weak_password', 'Password is known to be weak and easy to guess'],
  ])('passes through Supabase %s rejections as 400', async (code, message) => {
    mockCurrentPasswordOk();
    mockUpdateUserById.mockResolvedValueOnce({ data: { user: null }, error: { message, code, status: 422 } });

    const response = await post(validBody);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(message);
  });

  it('returns 500 when the admin update fails', async () => {
    mockCurrentPasswordOk();
    mockUpdateUserById.mockResolvedValueOnce({ data: { user: null }, error: { message: 'db down', status: 500 } });

    const response = await post(validBody);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to change password', status: 500 });
  });

  it('returns 500 when Supabase throws', async () => {
    mockIsolatedSignIn.mockRejectedValueOnce(new Error('network'));

    const response = await post(validBody);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error', status: 500 });
  });

  it('returns 401 without an Authorization header', async () => {
    const response = await post(validBody, null);

    expect(response.status).toBe(401);
    expect(mockIsolatedSignIn).not.toHaveBeenCalled();
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('returns 401 for an invalid token', async () => {
    const response = await post(validBody, 'bad-token');

    expect(response.status).toBe(401);
    expect(mockIsolatedSignIn).not.toHaveBeenCalled();
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });
});
