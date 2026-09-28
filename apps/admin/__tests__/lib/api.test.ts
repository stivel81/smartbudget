import * as api from '../../lib/api';

const BASE = 'http://localhost:3000';

function mockFetchResponse({
  ok = true,
  status = 200,
  json = {},
  jsonThrows = false,
}: { ok?: boolean; status?: number; json?: unknown; jsonThrows?: boolean } = {}) {
  const response = {
    ok,
    status,
    json: jsonThrows ? jest.fn().mockRejectedValue(new Error('bad json')) : jest.fn().mockResolvedValue(json),
  };
  (global.fetch as jest.Mock).mockResolvedValueOnce(response);
  return response;
}

function lastCall(): [string, RequestInit] {
  const calls = (global.fetch as jest.Mock).mock.calls;
  return calls[calls.length - 1];
}

beforeEach(() => {
  global.fetch = jest.fn();
});

describe('request helper (via exported functions)', () => {
  it('sends a Bearer Authorization header when a token is given', async () => {
    mockFetchResponse({ json: { users: [] } });
    await api.getUsers('tok-1');
    const [, init] = lastCall();
    expect(init.headers).toEqual({ Authorization: 'Bearer tok-1' });
  });

  it('omits Authorization when no token is given, and sets JSON content-type when a body is sent', async () => {
    mockFetchResponse({ json: { session: {} } });
    await api.login('a@b.com', 'pw');
    const [url, init] = lastCall();
    expect(url).toBe(`${BASE}/api/v1/auth/login`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({ email: 'a@b.com', password: 'pw' });
  });

  it('does not set Content-Type on requests without a body', async () => {
    mockFetchResponse({ status: 200, json: {} });
    await api.grantAdmin('u1', 'tok');
    const [, init] = lastCall();
    expect(init.headers).not.toHaveProperty('Content-Type');
  });

  it('returns the parsed JSON body on success', async () => {
    mockFetchResponse({ json: { users: [{ id: 'u1' }] } });
    await expect(api.getUsers('tok')).resolves.toEqual({ users: [{ id: 'u1' }] });
  });

  it('returns undefined for 204 No Content without parsing the body', async () => {
    const res = mockFetchResponse({ status: 204 });
    await expect(api.deleteUserData('u1', 'tok')).resolves.toBeUndefined();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('throws an ApiError with the server error message and status on failure', async () => {
    mockFetchResponse({ ok: false, status: 403, json: { error: 'Admin access required' } });
    await expect(api.getUsers('tok')).rejects.toEqual({ message: 'Admin access required', code: 403 });
  });

  it('falls back to a generic message when the error body has no error field', async () => {
    mockFetchResponse({ ok: false, status: 500, json: {} });
    await expect(api.getUsage('tok')).rejects.toEqual({ message: 'Request failed', code: 500 });
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    mockFetchResponse({ ok: false, status: 502, jsonThrows: true });
    await expect(api.getAuditLog('tok')).rejects.toEqual({ message: 'Request failed', code: 502 });
  });

  it('propagates network errors from fetch', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api.getUsers('tok')).rejects.toThrow('Failed to fetch');
  });
});

describe('API base URL', () => {
  const original = process.env.NEXT_PUBLIC_API_BASE_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = original;
  });

  it('uses NEXT_PUBLIC_API_BASE_URL when set', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    let isolated: typeof api | undefined;
    jest.isolateModules(() => {
      isolated = require('../../lib/api');
    });
    mockFetchResponse({ json: { users: [] } });
    await isolated!.getUsers('tok');
    expect(lastCall()[0]).toBe('https://api.example.com/api/v1/admin/users');
  });
});

describe('endpoint mapping', () => {
  const cases: [string, string, string, () => Promise<unknown>][] = [
    ['getUsers', '/api/v1/admin/users', 'GET', () => api.getUsers('t')],
    ['getUserDetail', '/api/v1/admin/users/u1', 'GET', () => api.getUserDetail('u1', 't')],
    ['getUserReceipts', '/api/v1/admin/users/u1/receipts', 'GET', () => api.getUserReceipts('u1', 't')],
    ['grantAdmin', '/api/v1/admin/users/u1/admin', 'POST', () => api.grantAdmin('u1', 't')],
    ['revokeAdmin', '/api/v1/admin/users/u1/admin', 'DELETE', () => api.revokeAdmin('u1', 't')],
    ['suspendUser', '/api/v1/admin/users/u1/suspend', 'POST', () => api.suspendUser('u1', 't')],
    ['unsuspendUser', '/api/v1/admin/users/u1/unsuspend', 'POST', () => api.unsuspendUser('u1', 't')],
    ['deleteUserData', '/api/v1/admin/users/u1', 'DELETE', () => api.deleteUserData('u1', 't')],
    ['exportUserData', '/api/v1/admin/users/u1/export', 'GET', () => api.exportUserData('u1', 't')],
    ['getUsage', '/api/v1/admin/usage', 'GET', () => api.getUsage('t')],
    ['getRateLimitViolations', '/api/v1/admin/rate-limit-violations', 'GET', () => api.getRateLimitViolations('t')],
    ['getFailedScans', '/api/v1/admin/failed-scans', 'GET', () => api.getFailedScans('t')],
    ['getAuditLog', '/api/v1/admin/audit-log', 'GET', () => api.getAuditLog('t')],
    ['getScanLog', '/api/v1/admin/scan-log', 'GET', () => api.getScanLog('t')],
  ];

  it.each(cases)('%s hits %s %s with the bearer token', async (_name, path, method, call) => {
    mockFetchResponse({ json: {} });
    await call();
    const [url, init] = lastCall();
    expect(url).toBe(`${BASE}${path}`);
    expect(init.method ?? 'GET').toBe(method);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t');
  });

  it('covers every exported function', () => {
    const exported = Object.entries(api)
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => k)
      .filter((k) => k !== 'login')
      .sort();
    expect(exported).toEqual(cases.map((c) => c[0]).sort());
  });
});
