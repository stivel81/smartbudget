// TRUST_PROXY: X-Forwarded-For must only be believed when explicitly enabled
// (Cloud Run: TRUST_PROXY=1). Otherwise any client could send a fresh
// X-Forwarded-For per request and walk past the per-IP login limit.
import express from 'express';
import request from 'supertest';
import { parseTrustProxy } from '../config/env';

// Each isolated app load gets its own fresh mock (factories re-run per
// jest.isolateModules registry).
jest.mock('@smartbudget/shared/lib/supabase', () => {
  const insert = jest.fn(() => ({ then: (resolve: (v: unknown) => void) => resolve({ error: null }) }));
  return {
    supabase: {
      from: jest.fn(() => ({ insert })),
      rpc: jest.fn(),
      auth: { getUser: jest.fn() },
      __insert: insert,
    },
  };
});
jest.mock('@smartbudget/shared/lib/supabaseAuth', () => ({
  supabaseAuth: {},
  createIsolatedAuthClient: jest.fn(),
}));
jest.mock('../services/claude', () => ({ scanReceipt: jest.fn(), RECEIPT_CATEGORIES: [] }));

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

function loadApp(env: Record<string, string | undefined>) {
  process.env = { ...saved, TEST_ENABLE_RATE_LIMIT: '1', RATE_LIMIT_STORE: 'memory', ...env };
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  let loaded: { app: express.Express; insert: jest.Mock } | undefined;
  jest.isolateModules(() => {
    const { app } = require('../index');
    const { supabase } = require('@smartbudget/shared/lib/supabase');
    loaded = { app, insert: supabase.__insert };
  });
  return loaded!;
}

// Empty body -> 400 before any Supabase call, but it still counts toward
// the login limiter (every request counts).
const login = (app: express.Express, xff?: string) => {
  const req = request(app).post('/api/v1/auth/login').send({});
  return xff ? req.set('X-Forwarded-For', xff) : req;
};

describe('req.ip with TRUST_PROXY', () => {
  function ipApp(raw: string | undefined) {
    const app = express();
    app.set('trust proxy', parseTrustProxy(raw));
    app.get('/ip', (req, res) => {
      res.json({ ip: req.ip });
    });
    return app;
  }

  it('ignores X-Forwarded-For when unset (local dev default)', async () => {
    const res = await request(ipApp(undefined)).get('/ip').set('X-Forwarded-For', '203.0.113.9');
    expect(res.body.ip).not.toBe('203.0.113.9');
    expect(res.body.ip).toMatch(/127\.0\.0\.1/);
  });

  it('uses the last X-Forwarded-For hop with TRUST_PROXY=1 (what Google\'s front end appends)', async () => {
    // A client-forged leading entry is ignored; the proxy-appended one wins.
    const res = await request(ipApp('1')).get('/ip').set('X-Forwarded-For', '6.6.6.6, 203.0.113.9');
    expect(res.body.ip).toBe('203.0.113.9');
  });
});

describe('login rate limit behind a proxy', () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    // express-rate-limit warns (console.error) about X-Forwarded-For when
    // trust proxy is off — that is the scenario under test.
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it('TRUST_PROXY unset: rotating X-Forwarded-For does NOT evade the per-IP limit', async () => {
    const { app, insert } = loadApp({ TRUST_PROXY: undefined });
    expect(app.get('trust proxy')).toBe(false);

    for (let i = 0; i < 10; i++) {
      expect((await login(app, `198.51.100.${i}`)).status).toBe(400);
    }
    const limited = await login(app, '198.51.100.200');
    expect(limited.status).toBe(429);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ ip: expect.not.stringContaining('198.51.100') }));
  });

  it('TRUST_PROXY=1: limits per real client IP from X-Forwarded-For', async () => {
    const { app, insert } = loadApp({ TRUST_PROXY: '1' });
    expect(app.get('trust proxy')).toBe(1);

    for (let i = 0; i < 10; i++) {
      expect((await login(app, '203.0.113.1')).status).toBe(400);
    }
    const limited = await login(app, '203.0.113.1');
    expect(limited.status).toBe(429);
    expect(insert).toHaveBeenCalledWith({ ip: '203.0.113.1', route: '/api/v1/auth/login' });

    // A different client behind the same proxy keeps its own budget.
    expect((await login(app, '203.0.113.2')).status).toBe(400);
  });

  it('refuses to start with TRUST_PROXY=true', () => {
    expect(() => loadApp({ TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY=true is not allowed/);
  });
});
