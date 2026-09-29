import { formatDayMonthYear, formatReceiptDate, parseReceiptDate } from '../../lib/receiptDate';

const created = new Date(2026, 8, 29, 10, 0, 0);
const receipt = (date: unknown, createdAt: string = created.toISOString()) => ({
  created_at: createdAt,
  raw_response: { merchant: 'M', total: 1, date: date as string | null, items: [] },
});

describe('parseReceiptDate', () => {
  it('reads an ISO date as that local calendar day', () => {
    expect(parseReceiptDate('2026-08-17')?.getTime()).toBe(new Date(2026, 7, 17).getTime());
    expect(parseReceiptDate(' 2026-08-17 ')?.getTime()).toBe(new Date(2026, 7, 17).getTime());
  });

  it('reads an ISO date-time', () => {
    const d = new Date(2026, 7, 17, 12, 0);
    expect(parseReceiptDate(d.toISOString())?.getTime()).toBe(d.getTime());
  });

  it.each([
    ['impossible date', '2026-02-30'],
    ['day-first (ambiguous) string', '17/08/2026'],
    ['junk', 'yesterday'],
    ['bad date-time', '2026-08-17Tnope'],
    ['null', null],
    ['number', 20260817],
  ])('returns null for %s', (_label, value) => {
    expect(parseReceiptDate(value)).toBeNull();
  });
});

describe('formatDayMonthYear', () => {
  it('formats day-first with zero padding', () => {
    expect(formatDayMonthYear(new Date(2026, 0, 5))).toBe('05/01/2026');
    expect(formatDayMonthYear(new Date(2026, 11, 31))).toBe('31/12/2026');
  });

  it('shows a dash for an invalid Date', () => {
    expect(formatDayMonthYear(new Date('nope'))).toBe('—');
  });
});

describe('formatReceiptDate', () => {
  it('shows an ISO receipt date as DD/MM/YYYY', () => {
    expect(formatReceiptDate(receipt('2026-08-17'))).toBe('17/08/2026');
  });

  it.each([
    ['null', null],
    ['legacy day-first', '17/08/2026'],
    ['impossible', '2026-04-31'],
  ])('falls back to the upload day when the date is %s', (_label, date) => {
    expect(formatReceiptDate(receipt(date))).toBe('29/09/2026');
  });

  it('copes with a missing raw_response and a bad created_at', () => {
    expect(formatReceiptDate({ created_at: 'garbage', raw_response: undefined as never })).toBe('—');
  });
});
