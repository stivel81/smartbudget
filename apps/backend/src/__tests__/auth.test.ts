import request from 'supertest';

jest.mock('@smartbudget/shared/lib/supabase', () => ({
  supabase: require('../testUtils/supabaseMock').supabase,
}));

jest.mock('@smartbudget/shared/lib/supabaseAuth', () => ({
  supabaseAuth: require('../testUtils/supabaseMock').supabaseAuth,
}));

import { app } from '../index';
import {
  mockSignUp,
  mockSignInWithPassword,
  mockRefreshSession,
  mockAdminSignOut,
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
