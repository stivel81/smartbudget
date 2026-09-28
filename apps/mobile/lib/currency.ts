// Pure currency formatting for every amount shown in the app (₪, en-US
// grouping: "₪2,847", "-₪50", "₪12.50"). Deliberately not Intl-based: the
// output must be identical under Hermes, JSC and Node (tests).

export const CURRENCY_SYMBOL = '₪';

const MAX_DECIMALS = 10;

export interface FormatCurrencyOptions {
  /** Digits after the decimal point (default 0). Clamped to 0–10; non-integers are floored. */
  decimals?: number;
}

function normalizeDecimals(decimals: unknown): number {
  if (typeof decimals !== 'number' || !Number.isFinite(decimals)) return 0;
  return Math.min(Math.max(Math.floor(decimals), 0), MAX_DECIMALS);
}

/**
 * Round a non-negative number half away from zero to `decimals` places.
 * Shifts via the decimal exponent (not `x * 10 ** d`) so binary artefacts
 * like 1.005 (really 1.00499999…) still round up the way people expect.
 */
function roundMagnitude(abs: number, decimals: number): number {
  const shifted = Number(`${abs}e${decimals}`);
  if (Number.isFinite(shifted)) {
    return Number(`${Math.round(shifted)}e-${decimals}`);
  }
  // String(abs) was already in exponent form (tiny like 1e-7, or ≥ 1e21), so
  // the string shift doesn't parse. Plain arithmetic is exact enough there.
  const factor = 10 ** decimals;
  const scaled = Math.round(abs * factor) / factor;
  return Number.isFinite(scaled) ? scaled : abs;
}

function groupThousands(integerDigits: string): string {
  return integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format an amount as shekels with thousands separators.
 *
 * - Rounds half away from zero (so 2.5 → "₪3" and -2.5 → "-₪3").
 * - Negative amounts put the sign before the symbol: "-₪50".
 * - Anything that rounds to zero prints unsigned ("₪0", never "-₪0").
 * - NaN, ±Infinity and non-numbers print as zero rather than "₪NaN".
 */
export function formatCurrency(amount: number, options: FormatCurrencyOptions = {}): string {
  const decimals = normalizeDecimals(options.decimals);
  const value = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;

  const rounded = roundMagnitude(Math.abs(value), decimals);
  const fixed = rounded.toFixed(decimals);
  const negative = value < 0 && rounded !== 0;
  const sign = negative ? '-' : '';

  if (fixed.includes('e')) {
    // ≥ 1e21: toFixed gives exponent notation; don't try to group it.
    return `${sign}${CURRENCY_SYMBOL}${fixed}`;
  }

  const [integerPart, fractionPart] = fixed.split('.');
  const grouped = groupThousands(integerPart);
  return `${sign}${CURRENCY_SYMBOL}${grouped}${fractionPart !== undefined ? `.${fractionPart}` : ''}`;
}

const PLAIN_AMOUNT = /^\d+(\.\d+)?$|^\.\d+$/;
const GROUPED_AMOUNT = /^\d{1,3}(,\d{3})+(\.\d+)?$/;

/**
 * Parse an amount the user typed (or that formatCurrency produced) back to a
 * number: optional leading ₪, optional correctly-placed thousands commas,
 * optional decimal part. Returns NaN for anything else — including negative
 * values, misplaced commas ("1,5" is ambiguous) and exponent notation.
 */
export function parseAmountInput(text: string): number {
  if (typeof text !== 'string') return NaN;
  let trimmed = text.trim();
  if (trimmed.startsWith(CURRENCY_SYMBOL)) trimmed = trimmed.slice(CURRENCY_SYMBOL.length).trim();
  if (PLAIN_AMOUNT.test(trimmed)) return Number(trimmed);
  if (GROUPED_AMOUNT.test(trimmed)) return Number(trimmed.replace(/,/g, ''));
  return NaN;
}
