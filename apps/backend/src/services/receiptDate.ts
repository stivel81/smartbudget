// Receipt date normalization.
//
// Receipts are stored with raw_response.date as an ISO calendar date
// ("YYYY-MM-DD") or null. Claude is asked for ISO, but Israeli receipts
// print day/month/year ("17/08/2026"), and older rows were saved verbatim —
// clients refuse such ambiguous strings and fall back to the upload time,
// which files the spend under the wrong month. Everything that writes a
// receipt date goes through normalizeReceiptDate() first.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
// An ISO date-time ("2026-08-17T10:30:00Z"): the calendar date written on the
// receipt is its date part; the time/zone never matters for a receipt.
const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
// Day-first with one consistent separator: 17/08/2026, 17.08.2026, 17-08-2026,
// 7/8/26. The product is Israeli (₪), so day/month order is never guessed.
const DAY_FIRST = /^(\d{1,2})([./-])(\d{1,2})\2(\d{4}|\d{2})$/;

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** "YYYY-MM-DD" when year/month/day form a real calendar date in range, else null. */
export function isoFromParts(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  if (month < 1 || month > 12 || day < 1) return null;
  // Day 0 of the next month is the last day of this one (UTC: no DST quirks).
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/**
 * Normalize a receipt date to ISO "YYYY-MM-DD", or null when it isn't a
 * recognizable real date.
 *
 * - ISO "YYYY-MM-DD" (validated; "2026-02-30" → null)
 * - ISO date-time → its date part
 * - Day-first "DD/MM/YYYY", "DD.MM.YYYY", "DD-MM-YYYY" (1- or 2-digit day and
 *   month); a 2-digit year means 20YY
 * - Surrounding whitespace is ignored; anything else (month names, US
 *   month-first strings, mixed separators, non-strings) → null
 */
export function normalizeReceiptDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();

  const iso = ISO_DATE.exec(trimmed) ?? ISO_DATE_TIME.exec(trimmed);
  if (iso) return isoFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dayFirst = DAY_FIRST.exec(trimmed);
  if (dayFirst) {
    const yearText = dayFirst[4];
    const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
    return isoFromParts(year, Number(dayFirst[3]), Number(dayFirst[1]));
  }

  return null;
}

/** True when `value` is already a stored-form date ("YYYY-MM-DD", real calendar date). */
export function isIsoReceiptDate(value: unknown): boolean {
  return typeof value === 'string' && ISO_DATE.test(value) && normalizeReceiptDate(value) === value;
}

export interface DateFix {
  id: string;
  old: unknown;
  new: string | null;
}

/**
 * Rows whose raw_response.date needs rewriting: any present date (not
 * undefined/null) that isn't already a valid ISO calendar date. `new` is the
 * normalized value, or null when the old value can't be understood — the
 * apps then fall back to the upload time, exactly as they do today.
 */
export function planDateFixes(rows: readonly { id: string; raw_response: unknown }[]): DateFix[] {
  const fixes: DateFix[] = [];
  for (const row of rows) {
    const raw = row.raw_response as { date?: unknown } | null | undefined;
    if (!raw || typeof raw !== 'object') continue;
    const old = raw.date;
    if (old === undefined || old === null) continue;
    if (isIsoReceiptDate(old)) continue;
    fixes.push({ id: row.id, old, new: normalizeReceiptDate(old) });
  }
  return fixes;
}
