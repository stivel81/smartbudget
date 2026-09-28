import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { supabase } from '@smartbudget/shared/lib/supabase';
import authRouter from './routes/auth';
import receiptsRouter from './routes/receipts';
import budgetsRouter from './routes/budgets';
import adminRouter from './routes/admin';

// Skip rate limiting under test by default, so the rest of the Jest suite
// isn't request-count-sensitive. A dedicated rate-limit test opts back in
// via TEST_ENABLE_RATE_LIMIT=1 without needing to touch NODE_ENV (which
// also gates app.listen() below).
const skipRateLimit = () => process.env.NODE_ENV === 'test' && process.env.TEST_ENABLE_RATE_LIMIT !== '1';

// express-rate-limit's own counters are in-memory (per-process, reset on
// restart) — log every rejected request so admins have real visibility
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

// Brute-force guard on login/signup — keyed by IP, before any auth exists.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimit,
  handler: rateLimitHandler,
});

// Password reset is a stricter, per-route budget on top of authLimiter:
// forgot-password sends email (spam/cost vector) and reset-password
// guesses a 6-digit code (brute-force vector). Separate instances so
// requesting codes can't exhaust the budget for redeeming one, and so
// neither eats into /login. Every request counts, including 400s.
export const PASSWORD_RESET_LIMIT = 5;
const passwordResetLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: PASSWORD_RESET_LIMIT,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipRateLimit,
    handler: rateLimitHandler,
  });
export const forgotPasswordLimiter = passwordResetLimiter();
export const resetPasswordLimiter = passwordResetLimiter();

// Scan calls Claude (real cost per request) — cap per-IP request rate.
export const scanLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimit,
  handler: rateLimitHandler,
});

export const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

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

// Health check route
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// API v1 routes
app.get('/api/v1/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// Auth routes (password reset gets its own tighter limit first)
app.use('/api/v1/auth/forgot-password', forgotPasswordLimiter);
app.use('/api/v1/auth/reset-password', resetPasswordLimiter);
app.use('/api/v1/auth', authLimiter, authRouter);

// Receipt routes (scan hits the Claude API, so it gets its own tighter limit)
app.use('/api/v1/receipts/scan', scanLimiter);
app.use('/api/v1/receipts', receiptsRouter);

// Budget routes
app.use('/api/v1/budgets', budgetsRouter);

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
  app.listen(port, () => {
    console.log(`Backend listening on port ${port}`);
  });

  // Verify Supabase connection on startup
  supabase.auth.getUser().catch((err) => {
    console.warn('Warning: Supabase connection check failed (expected in test environments):', err.message);
  });
}
