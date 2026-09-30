// Startup configuration: parsing + validation of the backend's environment.
// See apps/backend/.env.example for what each variable means.
//
// Pure functions of an env object (no reads of process.env at module load),
// so they can be unit-tested without re-importing the app.

type Env = Record<string, string | undefined>;

// Needed for the backend to do anything useful. Missing in production is a
// fatal startup error; elsewhere (local dev, tests) the relevant modules fail
// or are mocked on their own.
export const REQUIRED_IN_PRODUCTION = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'ANTHROPIC_API_KEY',
  // Without it CORS falls back to the localhost dev origins and the deployed
  // admin dashboard is locked out, so treat it as required in production.
  'ALLOWED_ORIGINS',
] as const;

export type RateLimitStoreKind = 'memory' | 'postgres';

/**
 * TRUST_PROXY -> Express's 'trust proxy' setting.
 *
 * - unset / '' / 'false' / '0' / 'off' -> false (local dev: req.ip is the
 *   socket address and X-Forwarded-For is ignored, so it can't be spoofed)
 * - a positive integer N -> trust the N nearest hops (Cloud Run: 1, Google's
 *   front end appends the real client IP as the last X-Forwarded-For entry)
 * - anything else -> passed through as Express's IP/subnet list form
 *   (e.g. 'loopback' or '10.0.0.0/8, 127.0.0.1')
 *
 * 'true' is rejected on purpose: it makes req.ip the LEFTMOST X-Forwarded-For
 * entry, which the client controls, so every request could claim a fresh IP
 * and walk straight past the per-IP rate limits.
 */
export function parseTrustProxy(raw: string | undefined): false | number | string {
  const value = (raw ?? '').trim();
  if (value === '' || ['false', '0', 'off', 'no'].includes(value.toLowerCase())) return false;
  if (value.toLowerCase() === 'true') {
    throw new Error(
      "TRUST_PROXY=true is not allowed: it trusts a client-supplied X-Forwarded-For. Set the number of proxy hops instead (Cloud Run: TRUST_PROXY=1)."
    );
  }
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

/**
 * RATE_LIMIT_STORE -> where express-rate-limit keeps its counters.
 * Defaults to 'postgres' in production (shared across Cloud Run instances,
 * survives scale-to-zero) and 'memory' everywhere else.
 */
export function parseRateLimitStore(raw: string | undefined, nodeEnv: string | undefined): RateLimitStoreKind {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === '') return nodeEnv === 'production' ? 'postgres' : 'memory';
  if (value === 'memory' || value === 'postgres') return value;
  throw new Error(`RATE_LIMIT_STORE must be "memory" or "postgres", got "${raw}".`);
}

export function parsePort(raw: string | undefined, fallback: number): number {
  const value = (raw ?? '').trim();
  if (value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${raw}".`);
  }
  return port;
}

/**
 * Returns every configuration problem (empty array = OK). Required variables
 * are only enforced when NODE_ENV=production; format errors always count.
 */
export function validateEnv(env: Env): string[] {
  const problems: string[] = [];
  const isProduction = env.NODE_ENV === 'production';

  if (isProduction) {
    const missing = REQUIRED_IN_PRODUCTION.filter((name) => !(env[name] ?? '').trim());
    if (missing.length > 0) problems.push(`Missing required environment variable(s): ${missing.join(', ')}`);
  }

  for (const [name, parse] of [
    ['TRUST_PROXY', () => parseTrustProxy(env.TRUST_PROXY)],
    ['RATE_LIMIT_STORE', () => parseRateLimitStore(env.RATE_LIMIT_STORE, env.NODE_ENV)],
    ['PORT', () => parsePort(env.PORT, 3000)],
  ] as const) {
    try {
      parse();
    } catch (err) {
      problems.push(err instanceof Error ? err.message : `${name}: ${String(err)}`);
    }
  }

  if (isProduction && env.ALLOWED_ORIGINS) {
    const origins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
    if (origins.length === 0) problems.push('ALLOWED_ORIGINS is set but lists no origins');
  }

  return problems;
}

/** Throws one clear, aggregated error if the environment is unusable. */
export function assertValidEnv(env: Env): void {
  const problems = validateEnv(env);
  if (problems.length === 0) return;
  throw new Error(
    `Invalid backend configuration (NODE_ENV=${env.NODE_ENV ?? 'unset'}):\n` +
      problems.map((p) => `  - ${p}`).join('\n') +
      '\nSee apps/backend/.env.example for every variable and its meaning.'
  );
}
