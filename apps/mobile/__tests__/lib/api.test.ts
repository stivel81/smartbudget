import {
  login,
  signup,
  scanReceipt,
  getReceipts,
  refreshSession,
  requestPasswordReset,
  resetPassword,
  changePassword,
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
});
