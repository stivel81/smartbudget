import { login, signup, scanReceipt, getReceipts } from '../../lib/api';

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
});
