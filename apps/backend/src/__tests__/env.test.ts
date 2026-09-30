import {
  REQUIRED_IN_PRODUCTION,
  assertValidEnv,
  parsePort,
  parseRateLimitStore,
  parseTrustProxy,
  validateEnv,
} from '../config/env';

const FULL_PROD_ENV = {
  NODE_ENV: 'production',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_KEY: 'service-key',
  ANTHROPIC_API_KEY: 'anthropic-key',
  ALLOWED_ORIGINS: 'https://admin.example.com',
};

describe('parseTrustProxy', () => {
  it.each([undefined, '', '  ', 'false', 'FALSE', '0', 'off', 'no'])('is off for %p', (raw) => {
    expect(parseTrustProxy(raw)).toBe(false);
  });

  it('parses a hop count', () => {
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy(' 2 ')).toBe(2);
  });

  it('passes an IP/subnet list through', () => {
    expect(parseTrustProxy('loopback, 10.0.0.0/8')).toBe('loopback, 10.0.0.0/8');
  });

  it('rejects "true" (would trust a spoofable leftmost X-Forwarded-For)', () => {
    expect(() => parseTrustProxy('true')).toThrow(/TRUST_PROXY=true is not allowed/);
  });
});

describe('parseRateLimitStore', () => {
  it('defaults to postgres in production and memory elsewhere', () => {
    expect(parseRateLimitStore(undefined, 'production')).toBe('postgres');
    expect(parseRateLimitStore(undefined, 'development')).toBe('memory');
    expect(parseRateLimitStore('', 'test')).toBe('memory');
    expect(parseRateLimitStore(undefined, undefined)).toBe('memory');
  });

  it('honours an explicit value', () => {
    expect(parseRateLimitStore('memory', 'production')).toBe('memory');
    expect(parseRateLimitStore('POSTGRES', 'development')).toBe('postgres');
  });

  it('rejects anything else', () => {
    expect(() => parseRateLimitStore('redis', 'production')).toThrow(/RATE_LIMIT_STORE/);
  });
});

describe('parsePort', () => {
  it('falls back when unset and parses valid ports', () => {
    expect(parsePort(undefined, 3000)).toBe(3000);
    expect(parsePort('', 3000)).toBe(3000);
    expect(parsePort('8080', 3000)).toBe(8080);
  });

  it.each(['abc', '0', '70000', '80.5'])('rejects %p', (raw) => {
    expect(() => parsePort(raw, 3000)).toThrow(/PORT/);
  });
});

describe('validateEnv / assertValidEnv', () => {
  it('accepts a complete production environment', () => {
    expect(validateEnv(FULL_PROD_ENV)).toEqual([]);
    expect(() => assertValidEnv({ ...FULL_PROD_ENV, TRUST_PROXY: '1', RATE_LIMIT_STORE: 'postgres', PORT: '8080' })).not.toThrow();
  });

  it('does not require secrets outside production (local dev / tests)', () => {
    expect(validateEnv({ NODE_ENV: 'development' })).toEqual([]);
    expect(validateEnv({ NODE_ENV: 'test' })).toEqual([]);
    expect(validateEnv({})).toEqual([]);
  });

  it('lists every missing required variable in production in one message', () => {
    expect(() => assertValidEnv({ NODE_ENV: 'production' })).toThrow(
      new RegExp(`Missing required environment variable\\(s\\): ${REQUIRED_IN_PRODUCTION.join(', ')}`)
    );
  });

  it('treats blank values as missing', () => {
    const problems = validateEnv({ ...FULL_PROD_ENV, ANTHROPIC_API_KEY: '   ' });
    expect(problems).toEqual(['Missing required environment variable(s): ANTHROPIC_API_KEY']);
  });

  it('rejects an ALLOWED_ORIGINS with no origins in production', () => {
    expect(validateEnv({ ...FULL_PROD_ENV, ALLOWED_ORIGINS: ' , ' })).toContain('ALLOWED_ORIGINS is set but lists no origins');
  });

  it('reports format errors in any environment, alongside missing vars', () => {
    const problems = validateEnv({ NODE_ENV: 'production', TRUST_PROXY: 'true', RATE_LIMIT_STORE: 'redis', PORT: 'x' });
    expect(problems).toHaveLength(4);
    expect(validateEnv({ NODE_ENV: 'development', PORT: 'x' })).toHaveLength(1);
  });

  it('points at .env.example', () => {
    expect(() => assertValidEnv({ NODE_ENV: 'production' })).toThrow(/apps\/backend\/\.env\.example/);
  });
});

describe('startup (src/index.ts)', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('fails fast, before loading the Supabase client, when production config is missing', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env = { NODE_ENV: 'production', DOTENV_CONFIG_PATH: '/nonexistent/.env' } as NodeJS.ProcessEnv;

    jest.isolateModules(() => {
      expect(() => require('../index')).toThrow(/Missing required environment variable\(s\): SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY, ALLOWED_ORIGINS/);
    });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/^FATAL: Invalid backend configuration/));
    errorSpy.mockRestore();
  });
});
