import 'dotenv/config';
// Must stay the first import after dotenv: validates the environment before
// anything that reads secrets is loaded (fail fast in production).
import './config/startupCheck';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { supabase } from '@smartbudget/shared/lib/supabase';
import authRouter from './routes/auth';
import receiptsRouter from './routes/receipts';
import budgetsRouter from './routes/budgets';
import categoriesRouter from './routes/categories';
import adminRouter from './routes/admin';
import { parsePort, parseRateLimitStore, parseTrustProxy } from './config/env';
import { PostgresStore } from './services/rateLimitStore';

// Skip rate limiting under test by default, so the rest of the Jest suite
// isn't request-count-sensitive. A dedicated rate-limit test opts back in
// via TEST_ENABLE_RATE_LIMIT=1 without needing to touch NODE_ENV (which
// also gates app.listen() below).
const skipRateLimit = () => process.env.NODE_ENV === 'test' && process.env.TEST_ENABLE_RATE_LIMIT !== '1';

// Where the counters live: RATE_LIMIT_STORE=postgres (default in production)
// shares them across all Cloud Run instances via public.rate_limit_counters;
// 'memory' (default elsewhere: local dev, tests) keeps them per-process.
export const RATE_LIMIT_STORE = parseRateLimitStore(process.env.RATE_LIMIT_STORE, process.env.NODE_ENV);

// Common options for every limiter. `name` is the counter-key prefix in the
// shared Postgres table, so each limiter must use a distinct one.
// passOnStoreError: if the Postgres store fails (it logs loudly), FAIL OPEN
// and let the request through rather than 500 every login during a DB blip.
function makeLimiter(name: string, windowMs: number, limit: number) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipRateLimit,
    handler: rateLimitHandler,
    store: RATE_LIMIT_STORE === 'postgres' ? new PostgresStore(name) : undefined,
    passOnStoreError: true,
  });
}

// Log every rejected request so admins have real visibility
// into abuse patterns (see GET /api/v1/admin/rate-limit-violations).
function rateLimitHandler(req: Request, res: Response) {
  supabase
    .from('rate_limit_violations')
    .insert({ ip: req.ip ?? null, route: req.originalUrl })
    .then(({ error }) => {
      if (error) console.error('Failed to log rate limit violation:', error);
    });
  res.status(429).json({ error: 'Too many requests, please try again later.', status: 429 });
}

// Brute-force guard on login/signup (the credential-guessing surface) —
// keyed by IP, before any auth exists. Only those two routes: session
// upkeep (/refresh, /logout) and the code/email routes have their own
// budgets, so none of them can lock a user out of signing in or vice versa.
export const AUTH_LIMIT = 10;
export const authLimiter = makeLimiter('auth', 15 * 60 * 1000, AUTH_LIMIT);

// Session upkeep: /refresh and /logout, each with its own generous budget.
// The app renews its access token proactively (~1/hour per device, 60s
// before expiry), on launch, on return to the foreground when due, and on
// a 401 — a handful of calls per device per hour, single-flight. 60 per 15
// min per IP (4/min sustained) leaves room for many devices sharing one
// public IP (mobile carrier CGNAT, office NAT) each doing that, while still
// capping abuse. There is no guessing surface to protect: /refresh needs a
// valid, high-entropy, single-use refresh token, and /logout needs a token
// too; the limit only bounds load (each call is a Supabase round-trip).
// A 429 here never signs the app out (lib/session.ts treats it as
// transient and retries with backoff).
export const SESSION_LIMIT = 60;
const sessionLimiter = (name: string) => makeLimiter(name, 15 * 60 * 1000, SESSION_LIMIT);
export const refreshLimiter = sessionLimiter('refresh');
export const logoutLimiter = sessionLimiter('logout');

// Password reset is a stricter, per-route budget (not shared with login):
// forgot-password sends email (spam/cost vector) and reset-password
// guesses a 6-digit code (brute-force vector). Separate instances so
// requesting codes can't exhaust the budget for redeeming one, and so
// neither eats into /login. Every request counts, including 400s.
export const PASSWORD_RESET_LIMIT = 5;
const passwordResetLimiter = (name: string) => makeLimiter(name, 15 * 60 * 1000, PASSWORD_RESET_LIMIT);
export const forgotPasswordLimiter = passwordResetLimiter('forgot-password');
export const resetPasswordLimiter = passwordResetLimiter('reset-password');
// Change-password verifies the current password, so it is a guessing vector
// for anyone holding a (stolen) access token — same strict budget, own counter.
export const changePasswordLimiter = passwordResetLimiter('change-password');
// Signup confirmation mirrors reset: verify-signup guesses a 6-digit code
// (brute-force vector), resend-signup sends email (spam/cost vector).
export const verifySignupLimiter = passwordResetLimiter('verify-signup');
export const resendSignupLimiter = passwordResetLimiter('resend-signup');

// Scan calls Claude (real cost per request) — cap per-IP request rate.
export const scanLimiter = makeLimiter('scan', 60 * 60 * 1000, 30);

export const app = express();
// Local dev default 3000 (the mobile app points there); the container image
// sets PORT=8080 and Cloud Run injects its own PORT.
const port = parsePort(process.env.PORT, 3000);

// Cloud Run sits behind Google's front end, which appends the real client IP
// to X-Forwarded-For. TRUST_PROXY=1 (one hop) makes req.ip — and therefore
// the per-IP rate limits and rate_limit_violations.ip — the real client
// instead of Google's proxy. Off by default (local dev: no proxy, and a
// client-sent X-Forwarded-For must not be believed). See config/env.ts.
export const TRUST_PROXY = parseTrustProxy(process.env.TRUST_PROXY);
app.set('trust proxy', TRUST_PROXY);

// Native mobile requests (iOS/Android) carry no Origin header and aren't
// subject to CORS at all — this only gates browser clients (Expo web, the
// admin dashboard). Defaults cover local dev; set ALLOWED_ORIGINS in
// production to the real deployed origins.
const DEFAULT_DEV_ORIGINS = [
  'http://localhost:8081', // Expo web (SDK 52+)
  'http://localhost:19006', // Expo web (legacy)
  'http://localhost:3000',
  'http://localhost:3001', // admin dashboard dev server
];
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : DEFAULT_DEV_ORIGINS;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
  })
);
// Base64-encoded receipt photos are larger than Express's 100kb JSON default.
app.use(express.json({ limit: '15mb' }));

// Health check routes: cheap, unauthenticated, no Supabase/Claude calls —
// safe for Cloud Run startup/liveness probes (point probes at /health).
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// API v1 routes
app.get('/api/v1/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// Auth routes: every route has exactly one per-IP budget — login/signup
// share authLimiter; session upkeep and the code/email routes have their own.
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/signup', authLimiter);
app.use('/api/v1/auth/refresh', refreshLimiter);
app.use('/api/v1/auth/logout', logoutLimiter);
app.use('/api/v1/auth/forgot-password', forgotPasswordLimiter);
app.use('/api/v1/auth/reset-password', resetPasswordLimiter);
app.use('/api/v1/auth/change-password', changePasswordLimiter);
app.use('/api/v1/auth/verify-signup', verifySignupLimiter);
app.use('/api/v1/auth/resend-signup', resendSignupLimiter);
app.use('/api/v1/auth', authRouter);

// Receipt routes (scan hits the Claude API, so it gets its own tighter limit)
app.use('/api/v1/receipts/scan', scanLimiter);
app.use('/api/v1/receipts', receiptsRouter);

// Budget routes
app.use('/api/v1/budgets', budgetsRouter);

// Category routes (base + the user's own custom categories)
app.use('/api/v1/categories', categoriesRouter);

// Admin routes (read-only; gated by profiles.is_admin, see requireAdmin)
app.use('/api/v1/admin', adminRouter);

// Error handling middleware (must be last)
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err);
  const status = (err as any).status || 500;
  const message = err.message || 'Internal Server Error';
  res.status(status).json({ error: message, status });
});

// Only start the server if this is not a test environment
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(port, () => {
    console.log(
      `Backend listening on port ${port} (NODE_ENV=${process.env.NODE_ENV ?? 'unset'}, rate-limit store=${RATE_LIMIT_STORE}, trust proxy=${TRUST_PROXY})`
    );
    if (process.env.NODE_ENV === 'production' && RATE_LIMIT_STORE === 'memory') {
      console.warn(
        'WARNING: RATE_LIMIT_STORE=memory in production — rate limits are per-instance and reset on every restart/scale-to-zero.'
      );
    }
  });

  // Cloud Run sends SIGTERM before stopping an instance: stop accepting new
  // connections, let in-flight requests finish, then exit.
  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Verify Supabase connection on startup
  supabase.auth.getUser().catch((err) => {
    console.warn('Warning: Supabase connection check failed (expected in test environments):', err.message);
  });
}
