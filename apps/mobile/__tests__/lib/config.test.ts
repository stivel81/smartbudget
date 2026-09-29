import { DEV_API_BASE_URL, resolveApiBaseUrl } from '../../lib/config';

describe('resolveApiBaseUrl', () => {
  describe('missing value', () => {
    it.each([undefined, '', '   '])('falls back to localhost in development (%p)', (raw) => {
      expect(resolveApiBaseUrl(raw, true)).toEqual({ ok: true, url: DEV_API_BASE_URL });
      expect(DEV_API_BASE_URL).toBe('http://localhost:3000');
    });

    it.each([undefined, '', '   '])('is an error outside development, naming the variable (%p)', (raw) => {
      const result = resolveApiBaseUrl(raw, false);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('EXPO_PUBLIC_API_BASE_URL');
        expect(result.error).toContain('not set');
      }
    });
  });

  describe('valid value', () => {
    it('is used as is in production and development', () => {
      expect(resolveApiBaseUrl('https://api.example.com', false)).toEqual({ ok: true, url: 'https://api.example.com' });
      expect(resolveApiBaseUrl('https://api.example.com', true)).toEqual({ ok: true, url: 'https://api.example.com' });
    });

    it('overrides the dev fallback in development', () => {
      expect(resolveApiBaseUrl('http://192.168.1.20:3000', true)).toEqual({ ok: true, url: 'http://192.168.1.20:3000' });
    });

    it.each([
      ['https://api.example.com/', 'https://api.example.com'],
      ['https://api.example.com///', 'https://api.example.com'],
      ['http://localhost:3000/', 'http://localhost:3000'],
      ['https://example.com/backend/', 'https://example.com/backend'],
      ['  https://api.example.com/  ', 'https://api.example.com'],
    ])('strips trailing slashes and whitespace: %p -> %p', (raw, url) => {
      expect(resolveApiBaseUrl(raw, false)).toEqual({ ok: true, url });
    });

    it.each(['HTTPS://API.EXAMPLE.COM', 'http://10.0.2.2:3000', 'http://[::1]:3000', 'https://api-dev.example.co.il/v'])(
      'accepts %p',
      (raw) => {
        expect(resolveApiBaseUrl(raw, false).ok).toBe(true);
      }
    );
  });

  describe('invalid value', () => {
    it.each([
      'api.example.com',
      'localhost:3000',
      '/api',
      'ftp://api.example.com',
      'ws://api.example.com',
      'https://',
      'https:///path',
      'https://api example.com',
      'https://api.example.com?x=1',
      'https://api.example.com/#frag',
      'https://user:pass@api.example.com',
      'not a url',
    ])('rejects %p, in production and development', (raw) => {
      for (const isDev of [false, true]) {
        const result = resolveApiBaseUrl(raw, isDev);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain('EXPO_PUBLIC_API_BASE_URL');
          expect(result.error).toContain('absolute http(s) URL');
        }
      }
    });

    it.each(['https://api-dev.REPLACE_ME', 'https://api.REPLACE_ME/'])('rejects the eas.json placeholder %p with its own message', (raw) => {
      const result = resolveApiBaseUrl(raw, false);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('placeholder');
    });

    it('does not fall back to localhost for a set-but-invalid value in development', () => {
      expect(resolveApiBaseUrl('api.example.com', true)).not.toEqual({ ok: true, url: DEV_API_BASE_URL });
    });
  });
});

/**
 * lib/api reads the env var and __DEV__ once, at import: load a fresh copy of
 * the module (and App) under a given environment.
 */
describe('API base URL wiring', () => {
  const ORIGINAL_ENV = process.env.EXPO_PUBLIC_API_BASE_URL;
  const g = globalThis as unknown as { __DEV__: boolean };
  const ORIGINAL_DEV = g.__DEV__;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = ORIGINAL_ENV;
    g.__DEV__ = ORIGINAL_DEV;
    jest.restoreAllMocks();
  });

  function loadApi(env: string | undefined, isDev: boolean): typeof import('../../lib/api') {
    if (env === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = env;
    g.__DEV__ = isDev;
    let api!: typeof import('../../lib/api');
    jest.isolateModules(() => {
      api = require('../../lib/api');
    });
    return api;
  }

  it('uses localhost in development when unset (today’s local setup)', () => {
    const api = loadApi(undefined, true);
    expect(api.API_BASE_URL).toBe('http://localhost:3000');
    expect(api.API_CONFIG_ERROR).toBeNull();
  });

  it('uses the configured URL without its trailing slash', async () => {
    const api = loadApi('https://api-stg.example.com/', false);
    expect(api.API_BASE_URL).toBe('https://api-stg.example.com');
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ session: {} }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    await api.login('a@b.co', 'pw');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api-stg.example.com/api/v1/auth/login');
  });

  it('in a production build without the variable: reports the error and never fetches (no localhost)', async () => {
    const api = loadApi(undefined, false);
    expect(api.API_CONFIG_ERROR).toContain('EXPO_PUBLIC_API_BASE_URL');
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(api.login('a@b.co', 'pw')).rejects.toEqual({ message: api.API_CONFIG_ERROR });
    await expect(api.signup('a@b.co', 'pw', 'A')).rejects.toEqual({ message: api.API_CONFIG_ERROR });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an invalid value is an error even in development', () => {
    const api = loadApi('api.example.com', true);
    expect(api.API_BASE_URL).toBe('');
    expect(api.API_CONFIG_ERROR).toContain('absolute http(s) URL');
  });
});
