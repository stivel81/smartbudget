import { EMAIL_NOT_CONFIRMED } from '../../lib/errors';
import {
  login,
  signup,
  scanReceipt,
  getReceipts,
  refreshSession,
  requestPasswordReset,
  resetPassword,
  changePassword,
  verifySignup,
  resendSignupCode,
  updateReceipt,
  getReceiptImageUrl,
  deleteReceipt,
  getBudgets,
  upsertBudget,
  deleteBudget,
  logout,
  API_BASE_URL,
} from '../../lib/api';

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as jest.Mock;
}

describe('lib/api', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('login', () => {
    it('returns the session on success', async () => {
      const session = { access_token: 'tok', refresh_token: 'ref', user: { id: '1', email: 'a@b.com' } };
      mockFetchOnce(200, { session });

      const result = await login('a@b.com', 'password123');

      expect(result.session).toEqual(session);
    });

    it('throws the backend error message on failure', async () => {
      mockFetchOnce(401, { error: 'Invalid email or password', status: 401 });

      await expect(login('a@b.com', 'wrong')).rejects.toMatchObject({
        message: 'Invalid email or password',
        code: 401,
      });
    });

    it('passes the display name through in the session', async () => {
      const session = { access_token: 'tok', refresh_token: 'ref', user: { id: '1', email: 'a@b.com', name: 'Ada Lovelace' } };
      mockFetchOnce(200, { session });

      const result = await login('a@b.com', 'password123');

      expect(result.session.user.name).toBe('Ada Lovelace');
    });

    it("exposes the backend's machine-readable code as errorCode for an unverified email", async () => {
      mockFetchOnce(401, { error: 'Please verify your email', status: 401, code: 'email_not_confirmed' });

      await expect(login('a@b.com', 'password123')).rejects.toEqual({
        message: 'Please verify your email',
        code: 401,
        errorCode: EMAIL_NOT_CONFIRMED,
      });
      expect(EMAIL_NOT_CONFIRMED).toBe('email_not_confirmed');
    });

    it('sets no errorCode when the backend sends none (or a non-string one)', async () => {
      mockFetchOnce(401, { error: 'Invalid email or password', status: 401 });
      await expect(login('a@b.com', 'wrong')).rejects.toEqual({ message: 'Invalid email or password', code: 401 });

      mockFetchOnce(401, { error: 'Invalid email or password', status: 401, code: 42 });
      await expect(login('a@b.com', 'wrong')).rejects.toEqual({ message: 'Invalid email or password', code: 401 });
    });

    it('falls back to a default message when the backend gives none', async () => {
      mockFetchOnce(500, {});

      await expect(login('a@b.com', 'password123')).rejects.toEqual({ message: 'Invalid credentials', code: 500 });
    });
  });

  describe('verifySignup', () => {
    it('POSTs email and code to /auth/verify-signup and returns the session', async () => {
      const session = { access_token: 'tok', refresh_token: 'ref', user: { id: '1', email: 'a@b.com', name: 'Ada' } };
      mockFetchOnce(200, { session });

      const result = await verifySignup('a@b.com', '123456');

      expect(result.session).toEqual(session);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`${API_BASE_URL}/api/v1/auth/verify-signup`);
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers.Authorization).toBeUndefined();
      expect(JSON.parse(options.body)).toEqual({ email: 'a@b.com', code: '123456' });
    });

    it('throws the backend error message and status for an invalid code', async () => {
      mockFetchOnce(400, { error: 'Invalid or expired code', status: 400 });

      await expect(verifySignup('a@b.com', '000000')).rejects.toEqual({
        message: 'Invalid or expired code',
        code: 400,
      });
    });

    it('throws the rate-limit message on 429', async () => {
      mockFetchOnce(429, { error: 'Too many requests, please try again later.', status: 429 });

      await expect(verifySignup('a@b.com', '123456')).rejects.toEqual({
        message: 'Too many requests, please try again later.',
        code: 429,
      });
    });

    it('falls back to a default message when the backend gives none', async () => {
      mockFetchOnce(500, {});

      await expect(verifySignup('a@b.com', '123456')).rejects.toEqual({
        message: 'Could not verify your email',
        code: 500,
      });
    });

    it('propagates network failures unchanged', async () => {
      const networkError = new TypeError('Network request failed');
      global.fetch = jest.fn().mockRejectedValue(networkError) as jest.Mock;

      await expect(verifySignup('a@b.com', '123456')).rejects.toBe(networkError);
    });
  });

  describe('resendSignupCode', () => {
    it('POSTs the email to /auth/resend-signup and returns the generic message', async () => {
      mockFetchOnce(200, { message: 'If that email is waiting to be verified...' });

      const result = await resendSignupCode('a@b.com');

      expect(result).toEqual({ message: 'If that email is waiting to be verified...' });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`${API_BASE_URL}/api/v1/auth/resend-signup`);
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(options.body)).toEqual({ email: 'a@b.com' });
    });

    it('throws the backend error message and status on failure', async () => {
      mockFetchOnce(429, { error: 'Too many requests, please try again later.', status: 429 });

      await expect(resendSignupCode('a@b.com')).rejects.toEqual({
        message: 'Too many requests, please try again later.',
        code: 429,
      });
    });

    it('falls back to a default message when the backend gives none', async () => {
      mockFetchOnce(500, {});

      await expect(resendSignupCode('a@b.com')).rejects.toEqual({
        message: 'Could not send a new code',
        code: 500,
      });
    });

    it('propagates network failures unchanged', async () => {
      const networkError = new TypeError('Network request failed');
      global.fetch = jest.fn().mockRejectedValue(networkError) as jest.Mock;

      await expect(resendSignupCode('a@b.com')).rejects.toBe(networkError);
    });
  });

  describe('refreshSession', () => {
    it('returns the new session on success', async () => {
      const session = { access_token: 'new-tok', refresh_token: 'new-ref', user: { id: '1', email: 'a@b.com' } };
      mockFetchOnce(200, { session });

      const result = await refreshSession('old-ref');

      expect(result.session).toEqual(session);
    });

    it('throws the backend error message when the refresh token is invalid', async () => {
      mockFetchOnce(401, { error: 'Invalid or expired refresh token', status: 401 });

      await expect(refreshSession('bad-ref')).rejects.toMatchObject({
        message: 'Invalid or expired refresh token',
        code: 401,
      });
    });
  });

  describe('signup', () => {
    it('throws the backend error message on failure', async () => {
      mockFetchOnce(400, { error: 'Email already registered', status: 400 });

      await expect(signup('a@b.com', 'password123', 'A')).rejects.toMatchObject({
        message: 'Email already registered',
      });
    });
  });

  describe('scanReceipt', () => {
    it('sends the image and auth header, returns the receipt', async () => {
      const receipt = {
        id: 'r1',
        user_id: 'u1',
        raw_response: { merchant: 'Store', total: 10, date: '2026-01-01', items: [] },
        created_at: '2026-01-01T00:00:00Z',
      };
      mockFetchOnce(201, { receipt });

      const result = await scanReceipt('base64data', 'image/jpeg', 'tok123');

      expect(result.receipt).toEqual(receipt);
      const [, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(options.headers.Authorization).toBe('Bearer tok123');
      expect(JSON.parse(options.body)).toEqual({ image: 'base64data', mediaType: 'image/jpeg' });
    });
  });

  describe('getReceipts', () => {
    it('returns the receipts list', async () => {
      mockFetchOnce(200, { receipts: [] });

      const result = await getReceipts('tok123');

      expect(result.receipts).toEqual([]);
    });
  });

  describe('requestPasswordReset', () => {
    it('POSTs the email to /auth/forgot-password and returns the generic message', async () => {
      mockFetchOnce(200, { message: 'If an account exists...' });

      const result = await requestPasswordReset('a@b.com');

      expect(result).toEqual({ message: 'If an account exists...' });
      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`${API_BASE_URL}/api/v1/auth/forgot-password`);
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(options.body)).toEqual({ email: 'a@b.com' });
    });

    it('throws the backend error message and status on failure', async () => {
      mockFetchOnce(429, { error: 'Too many requests, please try again later.', status: 429 });

      await expect(requestPasswordReset('a@b.com')).rejects.toEqual({
        message: 'Too many requests, please try again later.',
        code: 429,
      });
    });

    it('falls back to a default message when the backend gives none', async () => {
      mockFetchOnce(500, {});

      await expect(requestPasswordReset('a@b.com')).rejects.toEqual({
        message: 'Could not send reset code',
        code: 500,
      });
    });

    it('propagates network failures unchanged', async () => {
      const networkError = new TypeError('Network request failed');
      global.fetch = jest.fn().mockRejectedValue(networkError) as jest.Mock;

      await expect(requestPasswordReset('a@b.com')).rejects.toBe(networkError);
    });
  });

  describe('resetPassword', () => {
    it('POSTs email, code and newPassword to /auth/reset-password and returns the session', async () => {
      const session = { access_token: 'tok', refresh_token: 'ref', user: { id: '1', email: 'a@b.com' } };
      mockFetchOnce(200, { session });

      const result = await resetPassword('a@b.com', '123456', 'newpassword123');

      expect(result.session).toEqual(session);
      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`${API_BASE_URL}/api/v1/auth/reset-password`);
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(options.body)).toEqual({ email: 'a@b.com', code: '123456', newPassword: 'newpassword123' });
    });

    it('throws the backend error message and status for an invalid code', async () => {
      mockFetchOnce(400, { error: 'Invalid or expired code', status: 400 });

      await expect(resetPassword('a@b.com', '000000', 'newpassword123')).rejects.toEqual({
        message: 'Invalid or expired code',
        code: 400,
      });
    });

    it('falls back to a default message when the backend gives none', async () => {
      mockFetchOnce(500, {});

      await expect(resetPassword('a@b.com', '123456', 'newpassword123')).rejects.toEqual({
        message: 'Could not reset password',
        code: 500,
      });
    });
  });

  describe('changePassword', () => {
    it('POSTs both passwords with the bearer token to /auth/change-password', async () => {
      mockFetchOnce(200, { message: 'Password updated' });

      const result = await changePassword('oldpassword1', 'newpassword2', 'access-tok');

      expect(result).toEqual({ message: 'Password updated' });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`${API_BASE_URL}/api/v1/auth/change-password`);
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers.Authorization).toBe('Bearer access-tok');
      expect(JSON.parse(options.body)).toEqual({ currentPassword: 'oldpassword1', newPassword: 'newpassword2' });
    });

    it('throws the backend message and status for a wrong current password', async () => {
      mockFetchOnce(400, { error: 'Current password is incorrect', status: 400 });

      await expect(changePassword('wrong', 'newpassword2', 'tok')).rejects.toEqual({
        message: 'Current password is incorrect',
        code: 400,
      });
    });

    it('throws with the status on 401 (expired session)', async () => {
      mockFetchOnce(401, { error: 'Invalid or expired token', status: 401 });

      await expect(changePassword('a', 'newpassword2', 'expired')).rejects.toMatchObject({ code: 401 });
    });

    it('falls back to a generic message when the error body has none', async () => {
      mockFetchOnce(500, {});

      await expect(changePassword('a', 'newpassword2', 'tok')).rejects.toEqual({
        message: 'Could not change password',
        code: 500,
      });
    });

    it('propagates network failures untouched (no code), for apiErrorMessage to handle', async () => {
      const networkError = new TypeError('Network request failed');
      global.fetch = jest.fn().mockRejectedValue(networkError) as jest.Mock;

      await expect(changePassword('a', 'newpassword2', 'tok')).rejects.toBe(networkError);
    });
  });

  // Every authenticated call: right URL/method/bearer/body on success, and the
  // backend message (or a default) + HTTP status on failure.
  describe('authenticated calls', () => {
    const cases: {
      name: string;
      call: () => Promise<unknown>;
      url: string;
      method: string;
      body?: unknown;
      okBody: unknown;
      expected: unknown;
      fallback: string;
    }[] = [
      {
        name: 'scanReceipt',
        call: () => scanReceipt('b64', 'image/png', 'tok'),
        url: '/api/v1/receipts/scan',
        method: 'POST',
        body: { image: 'b64', mediaType: 'image/png' },
        okBody: { receipt: { id: 'r1' } },
        expected: { receipt: { id: 'r1' } },
        fallback: 'Failed to scan receipt',
      },
      {
        name: 'getReceipts',
        call: () => getReceipts('tok'),
        url: '/api/v1/receipts',
        method: 'GET',
        okBody: { receipts: [{ id: 'r1' }] },
        expected: { receipts: [{ id: 'r1' }] },
        fallback: 'Failed to load receipts',
      },
      {
        name: 'updateReceipt',
        call: () => updateReceipt('r1', { merchant: 'Shop', total: 12.5 }, 'tok'),
        url: '/api/v1/receipts/r1',
        method: 'PATCH',
        body: { merchant: 'Shop', total: 12.5 },
        okBody: { receipt: { id: 'r1' } },
        expected: { receipt: { id: 'r1' } },
        fallback: 'Failed to update receipt',
      },
      {
        name: 'getReceiptImageUrl',
        call: () => getReceiptImageUrl('r1', 'tok'),
        url: '/api/v1/receipts/r1/image-url',
        method: 'GET',
        okBody: { url: 'https://signed.example/img.jpg' },
        expected: 'https://signed.example/img.jpg',
        fallback: 'Failed to load receipt image',
      },
      {
        name: 'deleteReceipt',
        call: () => deleteReceipt('r1', 'tok'),
        url: '/api/v1/receipts/r1',
        method: 'DELETE',
        okBody: {},
        expected: undefined,
        fallback: 'Failed to delete receipt',
      },
      {
        name: 'getBudgets',
        call: () => getBudgets('tok'),
        url: '/api/v1/budgets',
        method: 'GET',
        okBody: { budgets: [{ id: 'b1' }] },
        expected: { budgets: [{ id: 'b1' }] },
        fallback: 'Failed to load budgets',
      },
      {
        name: 'upsertBudget',
        call: () => upsertBudget('Dining', 500, 'tok'),
        url: '/api/v1/budgets',
        method: 'POST',
        body: { category: 'Dining', monthlyLimit: 500 },
        okBody: { budget: { id: 'b1' } },
        expected: { budget: { id: 'b1' } },
        fallback: 'Failed to save budget',
      },
      {
        name: 'deleteBudget',
        call: () => deleteBudget('b1', 'tok'),
        url: '/api/v1/budgets/b1',
        method: 'DELETE',
        okBody: {},
        expected: undefined,
        fallback: 'Failed to delete budget',
      },
      {
        name: 'logout',
        call: () => logout('tok'),
        url: '/api/v1/auth/logout',
        method: 'POST',
        okBody: { message: 'Signed out successfully' },
        expected: undefined,
        fallback: 'Failed to sign out',
      },
    ];

    describe.each(cases)('$name', ({ call, url, method, body, okBody, expected, fallback }) => {
      it('calls the right endpoint with the bearer token and resolves the result', async () => {
        mockFetchOnce(200, okBody);

        await expect(call()).resolves.toEqual(expected);

        expect(global.fetch).toHaveBeenCalledTimes(1);
        const [calledUrl, options = {}] = (global.fetch as jest.Mock).mock.calls[0];
        expect(calledUrl).toBe(`${API_BASE_URL}${url}`);
        expect(options.method ?? 'GET').toBe(method);
        expect(options.headers.Authorization).toBe('Bearer tok');
        if (body === undefined) {
          expect(options.body).toBeUndefined();
        } else {
          expect(options.headers['Content-Type']).toBe('application/json');
          expect(JSON.parse(options.body)).toEqual(body);
        }
      });

      it("rejects with the backend's message and status", async () => {
        mockFetchOnce(403, { error: 'Forbidden thing', status: 403 });

        await expect(call()).rejects.toEqual({ message: 'Forbidden thing', code: 403 });
      });

      it('rejects with a default message when the backend gives none', async () => {
        mockFetchOnce(500, {});

        await expect(call()).rejects.toEqual({ message: fallback, code: 500 });
      });
    });
  });

  describe('default messages for the unauthenticated calls', () => {
    it.each([
      ['refreshSession', () => refreshSession('r'), 'Session expired'],
      ['signup', () => signup('a@b.com', 'password123', 'A B'), 'Signup failed'],
    ])('%s', async (_name, call, fallback) => {
      mockFetchOnce(500, {});

      await expect((call as () => Promise<unknown>)()).rejects.toEqual({ message: fallback, code: 500 });
    });
  });
});
