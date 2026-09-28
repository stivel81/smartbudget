// Admin-side configuration, read from NEXT_PUBLIC_* env vars at build time
// (see apps/admin/.env.example). Each process.env access must stay a literal
// `process.env.NEXT_PUBLIC_…` so Next.js can inline it into the client bundle.

export const DEFAULT_API_BASE_URL = 'http://localhost:3000';
export const DEFAULT_CLAUDE_MONTHLY_BUDGET_USD = 50;
export const DEFAULT_CLAUDE_DAILY_CALL_LIMIT = 2000;

/** A finite number > 0 parsed from `raw`, or `fallback`. */
export function parsePositiveNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** A positive whole number parsed from `raw`, or `fallback`. */
export function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = parsePositiveNumber(raw, fallback);
  return Number.isInteger(n) ? n : fallback;
}

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;

/**
 * Monthly Claude spend the AI Monitor measures against. Display-only: nothing
 * in the backend enforces it.
 */
export const CLAUDE_MONTHLY_BUDGET_USD = parsePositiveNumber(
  process.env.NEXT_PUBLIC_CLAUDE_MONTHLY_BUDGET_USD,
  DEFAULT_CLAUDE_MONTHLY_BUDGET_USD
);

/**
 * Daily Claude call count the AI Monitor measures against. Display-only: the
 * backend only rate-limits per IP, not globally per day.
 */
export const CLAUDE_DAILY_CALL_LIMIT = parsePositiveInt(
  process.env.NEXT_PUBLIC_CLAUDE_DAILY_CALL_LIMIT,
  DEFAULT_CLAUDE_DAILY_CALL_LIMIT
);
