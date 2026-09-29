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
  updateItemCategories,
  getReceiptImageUrl,
  deleteReceipt,
  getBudgets,
  upsertBudget,
  deleteBudget,
  logout,
  API_BASE_URL,
  setAccessTokenProvider,
  SESSION_EXPIRED_MESSAGE,
} from '../../lib/api';
import { createSessionManager } from '../../lib/session';

/** Poll (microtask/macrotask turns) until `cond` holds; fails after ~1s. */
async function waitForCondition(cond: () => boolean) {
  for (let i = 0; i < 200; i++) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('condition not met');
}

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as jest.Mock;
}

/** A provider that hands out `token` and can't renew (unless a test says otherwise). */
function fakeProvider(token: string | null = 'tok') {
  return {
    getAccessToken: jest.fn(async () => token),
    refreshAfterUnauthorized: jest.fn(async (_rejected: string): Promise<string | null> => null),
  };
}

type FakeResponse = { status: number; body?: unknown; nonJson?: boolean };

/** fetch resolving `responses` in order (the last one repeats). */
function mockFetchSequence(...responses: FakeResponse[]) {
  let i = 0;
  global.fetch = jest.fn(async () => {
    const r = responses[Math.min(i++, responses.length - 1)];
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => {
        if (r.nonJson) throw new SyntaxError('Unexpected token < in JSON');
        return r.body;
      },
    };
  }) as jest.Mock;
}

const fetchCall = (n: number) => (global.fetch as jest.Mock).mock.calls[n] as [string, any];

describe('lib/api', () => {
  let provider: ReturnType<typeof fakeProvider>;

  beforeEach(() => {
    provider = fakeProvider('tok');
    setAccessTokenProvider(provider);
  });

  afterEach(() => {
    setAccessTokenProvider(null);
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

    it.each([401, 429, 502])('keeps the HTTP status (%i) when the error body is not JSON', async (status) => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      }) as jest.Mock;

      await expect(refreshSession('r')).rejects.toEqual({ message: 'Session expired', code: status });
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

      const result = await scanReceipt('base64data', 'image/jpeg');

      expect(result.receipt).toEqual(receipt);
      const [, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(options.headers.Authorization).toBe('Bearer tok');
      expect(JSON.parse(options.body)).toEqual({ image: 'base64data', mediaType: 'image/jpeg' });
    });
  });

  describe('getReceipts', () => {
    it('returns the receipts list', async () => {
      mockFetchOnce(200, { receipts: [] });

      const result = await getReceipts();

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

      const result = await changePassword('oldpassword1', 'newpassword2');

      expect(result).toEqual({ message: 'Password updated' });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`${API_BASE_URL}/api/v1/auth/change-password`);
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers.Authorization).toBe('Bearer tok');
      expect(JSON.parse(options.body)).toEqual({ currentPassword: 'oldpassword1', newPassword: 'newpassword2' });
    });

    it('throws the backend message and status for a wrong current password — not an auth failure (no renewal)', async () => {
      mockFetchOnce(400, { error: 'Current password is incorrect', status: 400 });

      await expect(changePassword('wrong', 'newpassword2')).rejects.toEqual({
        message: 'Current password is incorrect',
        code: 400,
      });
      expect(provider.refreshAfterUnauthorized).not.toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('throws with the status on 401 when the session cannot be renewed', async () => {
      mockFetchOnce(401, { error: 'Invalid or expired token', status: 401 });

      await expect(changePassword('a', 'newpassword2')).rejects.toEqual({ message: 'Invalid or expired token', code: 401 });
      expect(provider.refreshAfterUnauthorized).toHaveBeenCalledWith('tok');
    });

    it('renews an expired session and retries (the live "Invalid or expired token" bug)', async () => {
      mockFetchSequence({ status: 401, body: { error: 'Invalid or expired token' } }, { status: 200, body: { message: 'Password updated' } });
      provider.refreshAfterUnauthorized.mockResolvedValueOnce('renewed');

      await expect(changePassword('oldpassword1', 'newpassword2')).resolves.toEqual({ message: 'Password updated' });
      expect(fetchCall(1)[1].headers.Authorization).toBe('Bearer renewed');
      expect(JSON.parse(fetchCall(1)[1].body)).toEqual({ currentPassword: 'oldpassword1', newPassword: 'newpassword2' });
    });

    it('falls back to a generic message when the error body has none', async () => {
      mockFetchOnce(500, {});

      await expect(changePassword('a', 'newpassword2')).rejects.toEqual({
        message: 'Could not change password',
        code: 500,
      });
    });

    it('propagates network failures untouched (no code), for apiErrorMessage to handle', async () => {
      const networkError = new TypeError('Network request failed');
      global.fetch = jest.fn().mockRejectedValue(networkError) as jest.Mock;

      await expect(changePassword('a', 'newpassword2')).rejects.toBe(networkError);
    });
  });

  // Every authenticated call: right URL/method/bearer/body on success, the
  // backend message (or a default) + HTTP status on failure, and the shared
  // renew-and-retry-once behavior on a 401.
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
        call: () => scanReceipt('b64', 'image/png'),
        url: '/api/v1/receipts/scan',
        method: 'POST',
        body: { image: 'b64', mediaType: 'image/png' },
        okBody: { receipt: { id: 'r1' } },
        expected: { receipt: { id: 'r1' } },
        fallback: 'Failed to scan receipt',
      },
      {
        name: 'getReceipts',
        call: () => getReceipts(),
        url: '/api/v1/receipts',
        method: 'GET',
        okBody: { receipts: [{ id: 'r1' }] },
        expected: { receipts: [{ id: 'r1' }] },
        fallback: 'Failed to load receipts',
      },
      {
        name: 'updateReceipt',
        call: () => updateReceipt('r1', { merchant: 'Shop', total: 12.5 }),
        url: '/api/v1/receipts/r1',
        method: 'PATCH',
        body: { merchant: 'Shop', total: 12.5 },
        okBody: { receipt: { id: 'r1' } },
        expected: { receipt: { id: 'r1' } },
        fallback: 'Failed to update receipt',
      },
      {
        name: 'updateReceipt (items + date)',
        call: () => updateReceipt('r1', { date: '17/08/2026', items: [{ index: 0, category: 'Dining' }] }),
        url: '/api/v1/receipts/r1',
        method: 'PATCH',
        body: { date: '17/08/2026', items: [{ index: 0, category: 'Dining' }] },
        okBody: { receipt: { id: 'r1' } },
        expected: { receipt: { id: 'r1' } },
        fallback: 'Failed to update receipt',
      },
      {
        name: 'updateItemCategories',
        call: () =>
          updateItemCategories(
            'r2',
            [
              { index: 0, category: 'Dining' },
              { index: 2, category: 'Health' },
            ]
          ),
        url: '/api/v1/receipts/r2',
        method: 'PATCH',
        body: {
          items: [
            { index: 0, category: 'Dining' },
            { index: 2, category: 'Health' },
          ],
        },
        okBody: { receipt: { id: 'r1', raw_response: { items: [] } } },
        expected: { receipt: { id: 'r1', raw_response: { items: [] } } },
        fallback: 'Failed to update receipt',
      },
      {
        name: 'getReceiptImageUrl',
        call: () => getReceiptImageUrl('r1'),
        url: '/api/v1/receipts/r1/image-url',
        method: 'GET',
        okBody: { url: 'https://signed.example/img.jpg' },
        expected: 'https://signed.example/img.jpg',
        fallback: 'Failed to load receipt image',
      },
      {
        name: 'deleteReceipt',
        call: () => deleteReceipt('r1'),
        url: '/api/v1/receipts/r1',
        method: 'DELETE',
        okBody: {},
        expected: undefined,
        fallback: 'Failed to delete receipt',
      },
      {
        name: 'getBudgets',
        call: () => getBudgets(),
        url: '/api/v1/budgets',
        method: 'GET',
        okBody: { budgets: [{ id: 'b1' }] },
        expected: { budgets: [{ id: 'b1' }] },
        fallback: 'Failed to load budgets',
      },
      {
        name: 'upsertBudget',
        call: () => upsertBudget('Dining', 500),
        url: '/api/v1/budgets',
        method: 'POST',
        body: { category: 'Dining', monthlyLimit: 500 },
        okBody: { budget: { id: 'b1' } },
        expected: { budget: { id: 'b1' } },
        fallback: 'Failed to save budget',
      },
      {
        name: 'deleteBudget',
        call: () => deleteBudget('b1'),
        url: '/api/v1/budgets/b1',
        method: 'DELETE',
        okBody: {},
        expected: undefined,
        fallback: 'Failed to delete budget',
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

      it('rejects with the default message when the error body is not JSON', async () => {
        mockFetchSequence({ status: 502, nonJson: true });

        await expect(call()).rejects.toEqual({ message: fallback, code: 502 });
      });

      it('on 401: renews the session once and retries the same request with the new token', async () => {
        mockFetchSequence({ status: 401, body: { error: 'Invalid or expired token' } }, { status: 200, body: okBody });
        provider.refreshAfterUnauthorized.mockResolvedValueOnce('renewed');

        await expect(call()).resolves.toEqual(expected);

        expect(provider.refreshAfterUnauthorized).toHaveBeenCalledTimes(1);
        expect(provider.refreshAfterUnauthorized).toHaveBeenCalledWith('tok');
        expect(global.fetch).toHaveBeenCalledTimes(2);
        const [firstUrl, first = {}] = fetchCall(0);
        const [retryUrl, retry = {}] = fetchCall(1);
        expect(first.headers.Authorization).toBe('Bearer tok');
        expect(retry.headers.Authorization).toBe('Bearer renewed');
        expect(retryUrl).toBe(firstUrl);
        expect(retry.method).toBe(first.method);
        expect(retry.body).toBe(first.body);
      });

      it('on 401 when the session cannot be renewed: rejects with the 401, no retry', async () => {
        mockFetchSequence({ status: 401, body: { error: 'Invalid or expired token' } });

        await expect(call()).rejects.toEqual({ message: 'Invalid or expired token', code: 401 });
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('authenticated requests: renewal rules (authedFetch)', () => {
    it('retries only once: a second 401 after renewing is returned, not renewed again', async () => {
      mockFetchSequence({ status: 401, body: { error: 'Invalid or expired token' } });
      provider.refreshAfterUnauthorized.mockResolvedValue('renewed');

      await expect(getBudgets()).rejects.toEqual({ message: 'Invalid or expired token', code: 401 });

      expect(provider.refreshAfterUnauthorized).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it.each([400, 403, 404, 409, 429, 500, 503])('a %i is never treated as an auth failure (no renewal, no retry)', async (status) => {
      mockFetchSequence({ status, body: { error: `status ${status}` } });

      await expect(getReceipts()).rejects.toEqual({ message: `status ${status}`, code: status });

      expect(provider.refreshAfterUnauthorized).not.toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('asks the provider for the token on every call (so a renewed one is used next time)', async () => {
      mockFetchSequence({ status: 200, body: { receipts: [] } });
      provider.getAccessToken.mockResolvedValueOnce('first').mockResolvedValueOnce('second');

      await getReceipts();
      await getReceipts();

      expect(fetchCall(0)[1].headers.Authorization).toBe('Bearer first');
      expect(fetchCall(1)[1].headers.Authorization).toBe('Bearer second');
    });

    it('signed out (provider has no token): rejects with the session-expired message without calling the backend', async () => {
      mockFetchSequence({ status: 200, body: {} });
      provider.getAccessToken.mockResolvedValueOnce(null);

      await expect(getReceipts()).rejects.toEqual({ message: SESSION_EXPIRED_MESSAGE, code: 401 });
      expect(global.fetch).not.toHaveBeenCalled();
      expect(SESSION_EXPIRED_MESSAGE).toBe('Your session expired, please sign in again');
    });

    it('no provider installed: rejects the same way', async () => {
      setAccessTokenProvider(null);
      mockFetchSequence({ status: 200, body: {} });

      await expect(getBudgets()).rejects.toEqual({ message: SESSION_EXPIRED_MESSAGE, code: 401 });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('an error response with a null JSON body uses the fallback message', async () => {
      mockFetchSequence({ status: 500, body: null });

      await expect(getBudgets()).rejects.toEqual({ message: 'Failed to load budgets', code: 500 });
    });

    it('a network failure on the retry propagates untouched', async () => {
      const networkError = new TypeError('Network request failed');
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'expired' }) })
        .mockRejectedValueOnce(networkError) as jest.Mock;
      provider.refreshAfterUnauthorized.mockResolvedValueOnce('renewed');

      await expect(getReceipts()).rejects.toBe(networkError);
    });
  });

  // lib/api + the real lib/session manager: what the app actually runs.
  describe('with the session manager as provider', () => {
    const session = (n: number) => ({
      access_token: `acc-${n}`,
      refresh_token: `ref-${n}`,
      expires_in: 3600,
      user: { email: 'a@b.com', name: null },
    });

    function setup(refresh: jest.Mock) {
      const onRefreshed = jest.fn();
      const onExpired = jest.fn();
      const manager = createSessionManager({ refresh, onRefreshed, onExpired });
      manager.setSession({ accessToken: 'acc-0', refreshToken: 'ref-0', expiresAt: Date.now() + 3_600_000 });
      setAccessTokenProvider(manager);
      return { manager, onRefreshed, onExpired };
    }

    /** 401 for the stale token, 200 for any other. */
    function backendAccepting(validToken: string) {
      global.fetch = jest.fn(async (_url: string, init: any) =>
        init.headers.Authorization === `Bearer ${validToken}`
          ? { ok: true, status: 200, json: async () => ({ receipts: [], budgets: [] }) }
          : { ok: false, status: 401, json: async () => ({ error: 'Invalid or expired token' }) }
      ) as jest.Mock;
    }

    it('concurrent 401s share ONE refresh (the rotated refresh token is never sent twice) and all retry with the new token', async () => {
      let resolveRefresh!: (v: unknown) => void;
      const refresh = jest.fn(() => new Promise((res) => (resolveRefresh = res)));
      const { manager, onRefreshed } = setup(refresh);
      backendAccepting('acc-1');

      const calls = [getReceipts(), getBudgets(), getReceipts()];
      await waitForCondition(() => refresh.mock.calls.length === 1 && (global.fetch as jest.Mock).mock.calls.length === 3);
      resolveRefresh(session(1));

      await expect(Promise.all(calls)).resolves.toHaveLength(3);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(refresh).toHaveBeenCalledWith('ref-0');
      expect(onRefreshed).toHaveBeenCalledTimes(1);
      const retries = (global.fetch as jest.Mock).mock.calls.slice(3);
      expect(retries.map(([, init]) => init.headers.Authorization)).toEqual(['Bearer acc-1', 'Bearer acc-1', 'Bearer acc-1']);
      expect(manager.getSession()).toMatchObject({ accessToken: 'acc-1', refreshToken: 'ref-1' });
      manager.dispose();
    });

    it('a 401 for a token that was already replaced retries with the current one, without another refresh', async () => {
      const refresh = jest.fn(async () => session(1));
      const { manager } = setup(refresh);
      backendAccepting('acc-1');

      await expect(getReceipts()).resolves.toEqual({ receipts: [], budgets: [] });
      // Second call starts with acc-1 already — but pretend a request made
      // with acc-0 comes back late: the manager answers with acc-1, no refresh.
      await expect(manager.refreshAfterUnauthorized('acc-0')).resolves.toBe('acc-1');
      expect(refresh).toHaveBeenCalledTimes(1);
      manager.dispose();
    });

    it('a 429 on /refresh is NOT a dead session: the call rejects with the retryable 429, the session is kept, the next call renews', async () => {
      const rateLimited = { message: 'Too many requests, please try again later.', code: 429 };
      const refresh = jest.fn().mockRejectedValueOnce(rateLimited).mockResolvedValueOnce(session(1));
      const { manager, onExpired } = setup(refresh);
      backendAccepting('acc-1');

      await expect(getReceipts()).rejects.toEqual(rateLimited);
      expect(onExpired).not.toHaveBeenCalled();
      expect(manager.getSession()).toMatchObject({ accessToken: 'acc-0', refreshToken: 'ref-0' });
      expect(global.fetch).toHaveBeenCalledTimes(1); // no retry without a new token

      await expect(getReceipts()).resolves.toEqual({ receipts: [], budgets: [] });
      expect(refresh.mock.calls).toEqual([['ref-0'], ['ref-0']]);
      manager.dispose();
    });

    it('a dead refresh token: every waiting call rejects, the user is signed out once, nothing is retried', async () => {
      const refresh = jest.fn(async () => {
        throw { message: 'Invalid or expired refresh token', code: 401 };
      });
      const { manager, onExpired } = setup(refresh);
      backendAccepting('never');

      const results = await Promise.allSettled([getReceipts(), getBudgets()]);

      expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(onExpired).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      // Signed out now: later calls don't even reach the backend.
      await expect(getReceipts()).rejects.toEqual({ message: SESSION_EXPIRED_MESSAGE, code: 401 });
      expect(global.fetch).toHaveBeenCalledTimes(2);
      manager.dispose();
    });
  });

  describe('logout', () => {
    it('POSTs the access token (header) and the refresh token (body)', async () => {
      mockFetchOnce(200, { message: 'Signed out successfully' });

      await expect(logout({ accessToken: 'acc', refreshToken: 'ref' })).resolves.toBeUndefined();

      const [url, options] = fetchCall(0);
      expect(url).toBe(`${API_BASE_URL}/api/v1/auth/logout`);
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer acc' });
      expect(JSON.parse(options.body)).toEqual({ refresh_token: 'ref' });
    });

    it('sends only the refresh token when there is no access token', async () => {
      mockFetchOnce(200, {});

      await logout({ accessToken: null, refreshToken: 'ref' });

      const [, options] = fetchCall(0);
      expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse(options.body)).toEqual({ refresh_token: 'ref' });
    });

    it('sends an empty body when there is no refresh token', async () => {
      mockFetchOnce(200, {});

      await logout({ accessToken: 'acc', refreshToken: null });

      expect(JSON.parse(fetchCall(0)[1].body)).toEqual({});
    });

    it('makes no request when there is no token at all', async () => {
      mockFetchOnce(200, {});

      await expect(logout({ accessToken: null, refreshToken: null })).resolves.toBeUndefined();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('never renews or retries, and never asks the provider (a 401 just rejects)', async () => {
      mockFetchSequence({ status: 401, body: { error: 'nope' } });

      await expect(logout({ accessToken: 'acc', refreshToken: 'ref' })).rejects.toEqual({ message: 'nope', code: 401 });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(provider.getAccessToken).not.toHaveBeenCalled();
      expect(provider.refreshAfterUnauthorized).not.toHaveBeenCalled();
    });

    it('rejects with a default message when the backend gives none', async () => {
      mockFetchOnce(500, {});

      await expect(logout({ accessToken: 'acc', refreshToken: 'ref' })).rejects.toEqual({ message: 'Failed to sign out', code: 500 });
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
