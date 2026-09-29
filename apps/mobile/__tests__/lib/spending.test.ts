import {
  budgetUsagePct,
  budgetsAtOrAbove,
  budgetsByCategory,
  categoryTotals,
  formatDayMonthYear,
  formatReceiptDate,
  isInMonth,
  parseReceiptDate,
  percentOf,
  receiptSpendDate,
  receiptsForMonth,
  receiptsSince,
  sortedCategoryTotals,
  sumLimits,
  sumSpent,
  sumTotals,
  withSpend,
} from '../../lib/spending';
import { greetingFor } from '../../lib/greeting';
import type { Receipt } from '../../lib/api';

type Item = { name: string; amount: number; category: string };

function receipt(
  id: string,
  opts: { date?: unknown; createdAt?: Date | string; total?: number; items?: Item[] } = {}
): Receipt {
  const createdAt = opts.createdAt ?? new Date(2000, 0, 1);
  return {
    id,
    user_id: 'u1',
    created_at: typeof createdAt === 'string' ? createdAt : createdAt.toISOString(),
    image_path: null,
    raw_response: {
      merchant: `M-${id}`,
      total: opts.total ?? 0,
      date: opts.date as string,
      items: opts.items ?? [],
    },
  };
}

// All "now" values are built from LOCAL components so the suite is
// independent of the machine's timezone.
const SEP_15 = new Date(2026, 8, 15, 12, 0, 0, 0);

describe('parseReceiptDate', () => {
  it('interprets a date-only string as that LOCAL calendar day at local midnight', () => {
    const d = parseReceiptDate('2026-09-01');
    // A naive `new Date('2026-09-01')` is UTC midnight, which is not local
    // midnight in any non-UTC zone (and is Aug 31 west of UTC).
    expect(d).not.toBeNull();
    expect(d!.getTime()).toBe(new Date(2026, 8, 1).getTime());
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(8);
    expect(d!.getDate()).toBe(1);
    expect(d!.getHours()).toBe(0);
  });

  it('interprets the last day of a month as that local day', () => {
    expect(parseReceiptDate('2026-08-31')!.getTime()).toBe(new Date(2026, 7, 31).getTime());
    expect(parseReceiptDate('2026-12-31')!.getTime()).toBe(new Date(2026, 11, 31).getTime());
  });

  it('trims surrounding whitespace', () => {
    expect(parseReceiptDate(' 2026-09-01 ')!.getTime()).toBe(new Date(2026, 8, 1).getTime());
  });

  it('accepts a leap day and rejects impossible calendar dates', () => {
    expect(parseReceiptDate('2028-02-29')!.getTime()).toBe(new Date(2028, 1, 29).getTime());
    expect(parseReceiptDate('2026-02-29')).toBeNull();
    expect(parseReceiptDate('2026-02-31')).toBeNull();
    expect(parseReceiptDate('2026-13-01')).toBeNull();
    expect(parseReceiptDate('2026-00-10')).toBeNull();
    expect(parseReceiptDate('2026-04-00')).toBeNull();
  });

  it('parses full ISO date-times as absolute instants', () => {
    expect(parseReceiptDate('2026-09-01T10:30:00Z')!.getTime()).toBe(Date.UTC(2026, 8, 1, 10, 30));
    expect(parseReceiptDate('2026-09-01T10:30:00+03:00')!.getTime()).toBe(Date.UTC(2026, 8, 1, 7, 30));
  });

  it('rejects an ISO-looking date-time that does not parse', () => {
    expect(parseReceiptDate('2026-09-01Tgarbage')).toBeNull();
  });

  it.each([
    ['empty string', ''],
    ['free text', 'yesterday'],
    ['ambiguous locale format', '01/09/2026'],
    ['partial date', '2026-09'],
    ['undefined', undefined],
    ['null', null],
    ['number', 20260901],
    ['object', {}],
  ])('returns null for %s', (_label, value) => {
    expect(parseReceiptDate(value)).toBeNull();
  });
});

describe('receiptSpendDate', () => {
  const created = new Date(2026, 5, 10, 9, 0, 0);

  it('uses raw_response.date when it is a valid date', () => {
    const r = receipt('r1', { date: '2026-09-03', createdAt: created });
    expect(receiptSpendDate(r).getTime()).toBe(new Date(2026, 8, 3).getTime());
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['invalid text', 'not a date'],
    ['impossible date', '2026-02-30'],
    ['null', null],
  ])('falls back to created_at when raw_response.date is %s', (_label, date) => {
    const r = receipt('r1', { date, createdAt: created });
    expect(receiptSpendDate(r).getTime()).toBe(created.getTime());
  });

  it('falls back to created_at when raw_response itself is missing', () => {
    const r = { ...receipt('r1', { createdAt: created }), raw_response: undefined } as unknown as Receipt;
    expect(receiptSpendDate(r).getTime()).toBe(created.getTime());
  });
});

describe('formatDayMonthYear', () => {
  it.each([
    [new Date(2026, 7, 17), '17/08/2026'],
    [new Date(2026, 0, 1), '01/01/2026'],
    [new Date(2026, 11, 31, 23, 59), '31/12/2026'],
    [new Date(2024, 1, 29), '29/02/2024'],
    [new Date(2026, 8, 5, 0, 0, 1), '05/09/2026'],
  ])('formats %s day-first as %s', (date, expected) => {
    expect(formatDayMonthYear(date)).toBe(expected);
  });

  it('shows a dash for an invalid Date instead of NaN', () => {
    expect(formatDayMonthYear(new Date('nope'))).toBe('—');
  });
});

describe('formatReceiptDate', () => {
  const created = new Date(2026, 8, 29, 10, 0, 0);

  it('shows an ISO receipt date as DD/MM/YYYY', () => {
    expect(formatReceiptDate(receipt('r1', { date: '2026-08-17', createdAt: created }))).toBe('17/08/2026');
  });

  it('uses the local calendar day of an ISO date-time', () => {
    expect(formatReceiptDate(receipt('r1', { date: new Date(2026, 7, 17, 23, 30).toISOString(), createdAt: created }))).toBe(
      '17/08/2026'
    );
  });

  it.each([
    ['null (no date on the receipt)', null],
    ['a legacy un-normalized day-first string', '17/08/2026'],
    ['an impossible date', '2026-02-30'],
  ])('falls back to the upload day when the date is %s', (_label, date) => {
    expect(formatReceiptDate(receipt('r1', { date, createdAt: created }))).toBe('29/09/2026');
  });

  it('shows a dash when neither date is usable', () => {
    expect(formatReceiptDate(receipt('r1', { date: null, createdAt: 'garbage' }))).toBe('—');
  });

  it('never returns the raw stored string', () => {
    expect(formatReceiptDate(receipt('r1', { date: '2026-08-17', createdAt: created }))).not.toBe('2026-08-17');
  });
});

describe('isInMonth', () => {
  it('includes the first millisecond of the month', () => {
    expect(isInMonth(new Date(2026, 8, 1, 0, 0, 0, 0), SEP_15)).toBe(true);
  });

  it('includes the last millisecond of the month', () => {
    expect(isInMonth(new Date(2026, 8, 30, 23, 59, 59, 999), SEP_15)).toBe(true);
  });

  it('excludes the last millisecond of the previous month', () => {
    expect(isInMonth(new Date(2026, 7, 31, 23, 59, 59, 999), SEP_15)).toBe(false);
  });

  it('excludes the first millisecond of the next month', () => {
    expect(isInMonth(new Date(2026, 9, 1, 0, 0, 0, 0), SEP_15)).toBe(false);
  });

  it('excludes the same month in a different year', () => {
    expect(isInMonth(new Date(2025, 8, 15), SEP_15)).toBe(false);
    expect(isInMonth(new Date(2027, 8, 15), SEP_15)).toBe(false);
  });

  it('handles the Dec -> Jan year rollover', () => {
    const jan1 = new Date(2027, 0, 1, 0, 0, 0, 0);
    expect(isInMonth(new Date(2026, 11, 31, 23, 59, 59, 999), jan1)).toBe(false);
    expect(isInMonth(new Date(2027, 0, 1, 0, 0, 0, 0), jan1)).toBe(true);
    const dec31 = new Date(2026, 11, 31, 23, 59, 59, 999);
    expect(isInMonth(new Date(2026, 11, 1), dec31)).toBe(true);
    expect(isInMonth(new Date(2027, 0, 1), dec31)).toBe(false);
  });

  it('returns false for an invalid date', () => {
    expect(isInMonth(new Date('nope'), SEP_15)).toBe(false);
  });
});

describe('receiptsForMonth', () => {
  it('returns an empty array for no receipts', () => {
    expect(receiptsForMonth([], SEP_15)).toEqual([]);
  });

  it('keeps only receipts whose spend date is in the current month', () => {
    const receipts = [
      receipt('prev-last-ms', { date: undefined, createdAt: new Date(2026, 7, 31, 23, 59, 59, 999) }),
      receipt('first-ms', { date: undefined, createdAt: new Date(2026, 8, 1, 0, 0, 0, 0) }),
      receipt('date-only-first', { date: '2026-09-01' }),
      receipt('date-only-prev', { date: '2026-08-31' }),
      receipt('date-only-last', { date: '2026-09-30' }),
      receipt('next-month', { date: '2026-10-01' }),
      receipt('last-year', { date: '2025-09-15' }),
    ];
    expect(receiptsForMonth(receipts, SEP_15).map((r) => r.id)).toEqual([
      'first-ms',
      'date-only-first',
      'date-only-last',
    ]);
  });

  it('prefers the receipt date over created_at (scanned late)', () => {
    // Bought in August, uploaded in September -> belongs to August.
    const r = receipt('late', { date: '2026-08-28', createdAt: new Date(2026, 8, 2) });
    expect(receiptsForMonth([r], SEP_15)).toEqual([]);
  });

  it('uses created_at when the receipt date is invalid', () => {
    const r = receipt('bad-date', { date: 'garbage', createdAt: new Date(2026, 8, 2) });
    expect(receiptsForMonth([r], SEP_15).map((x) => x.id)).toEqual(['bad-date']);
  });

  it('rolls over from December to January', () => {
    const jan = new Date(2027, 0, 5, 9);
    const receipts = [receipt('dec', { date: '2026-12-31' }), receipt('jan', { date: '2027-01-01' })];
    expect(receiptsForMonth(receipts, jan).map((r) => r.id)).toEqual(['jan']);
  });

  it('does not mutate the input array', () => {
    const receipts = [receipt('a', { date: '2026-08-01' }), receipt('b', { date: '2026-09-01' })];
    const copy = [...receipts];
    receiptsForMonth(receipts, SEP_15);
    expect(receipts).toEqual(copy);
  });
});

describe('receiptsSince', () => {
  const now = new Date(2026, 8, 15, 12, 0, 0, 0);

  it('returns an empty array for no receipts', () => {
    expect(receiptsSince([], 7, now)).toEqual([]);
  });

  it('includes a receipt exactly 7 days ago and excludes one a millisecond earlier', () => {
    const receipts = [
      receipt('exact', { date: undefined, createdAt: new Date(2026, 8, 8, 12, 0, 0, 0) }),
      receipt('just-before', { date: undefined, createdAt: new Date(2026, 8, 8, 11, 59, 59, 999) }),
      receipt('now', { date: undefined, createdAt: now }),
    ];
    expect(receiptsSince(receipts, 7, now).map((r) => r.id)).toEqual(['exact', 'now']);
  });

  it('treats date-only receipts as local midnight of that day', () => {
    const receipts = [
      receipt('today', { date: '2026-09-15' }),
      receipt('six-days', { date: '2026-09-09' }),
      // 2026-09-08 00:00 is before the cutoff of 2026-09-08 12:00
      receipt('seven-days', { date: '2026-09-08' }),
      receipt('old', { date: '2026-09-01' }),
    ];
    expect(receiptsSince(receipts, 7, now).map((r) => r.id)).toEqual(['today', 'six-days']);
  });

  it('includes date-only receipts on the cutoff day when now is local midnight', () => {
    const midnight = new Date(2026, 8, 15, 0, 0, 0, 0);
    const r = receipt('cutoff-day', { date: '2026-09-08' });
    expect(receiptsSince([r], 7, midnight).map((x) => x.id)).toEqual(['cutoff-day']);
  });

  it('crosses month and year boundaries', () => {
    const jan3 = new Date(2027, 0, 3, 12);
    const receipts = [receipt('dec28', { date: '2026-12-28' }), receipt('dec26', { date: '2026-12-26' })];
    expect(receiptsSince(receipts, 7, jan3).map((r) => r.id)).toEqual(['dec28']);
  });

  it('does not mutate the `now` argument', () => {
    const n = new Date(now.getTime());
    receiptsSince([receipt('a', { date: '2026-09-10' })], 7, n);
    expect(n.getTime()).toBe(now.getTime());
  });
});

describe('categoryTotals / sortedCategoryTotals', () => {
  it('returns empty results for no receipts', () => {
    expect(categoryTotals([])).toEqual({});
    expect(sortedCategoryTotals([])).toEqual([]);
  });

  it('aggregates line items by category across receipts with multiple items', () => {
    const receipts = [
      receipt('r1', {
        items: [
          { name: 'Milk', amount: 10, category: 'Groceries' },
          { name: 'Bread', amount: 5.5, category: 'Groceries' },
          { name: 'Coffee', amount: 12, category: 'Dining' },
        ],
      }),
      receipt('r2', {
        items: [
          { name: 'Eggs', amount: 20, category: 'Groceries' },
          { name: 'Bus', amount: 6, category: 'Transport' },
        ],
      }),
      receipt('r3', { items: [] }),
    ];
    expect(categoryTotals(receipts)).toEqual({ Groceries: 35.5, Dining: 12, Transport: 6 });
    expect(sortedCategoryTotals(receipts)).toEqual([
      { category: 'Groceries', spent: 35.5 },
      { category: 'Dining', spent: 12 },
      { category: 'Transport', spent: 6 },
    ]);
  });

  it('breaks ties by category name', () => {
    const receipts = [
      receipt('r1', {
        items: [
          { name: 'a', amount: 10, category: 'Transport' },
          { name: 'b', amount: 10, category: 'Dining' },
        ],
      }),
    ];
    expect(sortedCategoryTotals(receipts).map((c) => c.category)).toEqual(['Dining', 'Transport']);
  });

  it('tolerates a receipt with no raw_response items', () => {
    const r = { ...receipt('r1'), raw_response: undefined } as unknown as Receipt;
    expect(categoryTotals([r])).toEqual({});
  });
});

describe('sumTotals / sumSpent / sumLimits', () => {
  it('returns 0 for empty input', () => {
    expect(sumTotals([])).toBe(0);
    expect(sumSpent([])).toBe(0);
    expect(sumLimits([])).toBe(0);
  });

  it('sums receipt totals', () => {
    expect(sumTotals([receipt('a', { total: 100 }), receipt('b', { total: 40.25 })])).toBe(140.25);
  });

  it('treats a receipt without raw_response as 0', () => {
    const r = { ...receipt('r1'), raw_response: undefined } as unknown as Receipt;
    expect(sumTotals([r, receipt('b', { total: 5 })])).toBe(5);
  });

  it('sums spent and monthly limits', () => {
    expect(sumSpent([{ spent: 1 }, { spent: 2.5 }])).toBe(3.5);
    expect(sumLimits([{ monthly_limit: 1000 }, { monthly_limit: 400 }])).toBe(1400);
  });
});

describe('percentOf / budgetUsagePct', () => {
  it('computes a percentage', () => {
    expect(budgetUsagePct(50, 200)).toBe(25);
    expect(budgetUsagePct(110, 100)).toBeCloseTo(110);
    expect(budgetUsagePct(0, 100)).toBe(0);
    expect(percentOf(1, 4)).toBe(25);
  });

  it.each([
    ['zero limit', 50, 0],
    ['negative limit', 50, -100],
    ['NaN limit', 50, NaN],
    ['infinite limit', 50, Infinity],
    ['NaN spend', NaN, 100],
    ['infinite spend', Infinity, 100],
    ['zero over zero', 0, 0],
  ])('returns 0 (never NaN/Infinity) for %s', (_label, spent, limit) => {
    const pct = budgetUsagePct(spent, limit);
    expect(pct).toBe(0);
    expect(Number.isFinite(pct)).toBe(true);
  });
});

describe('budgetsAtOrAbove', () => {
  const rows = [
    { category: 'A', monthly_limit: 100, spent: 89.99 },
    { category: 'B', monthly_limit: 100, spent: 90 },
    { category: 'C', monthly_limit: 100, spent: 100 },
    { category: 'D', monthly_limit: 100, spent: 150 },
    { category: 'Z', monthly_limit: 0, spent: 50 },
  ];

  it('filters by inclusive threshold', () => {
    expect(budgetsAtOrAbove(rows, 90).map((r) => r.category)).toEqual(['B', 'C', 'D']);
    expect(budgetsAtOrAbove(rows, 100).map((r) => r.category)).toEqual(['C', 'D']);
  });

  it('never flags a zero-limit budget', () => {
    expect(budgetsAtOrAbove(rows, 1).map((r) => r.category)).not.toContain('Z');
  });

  it('returns an empty array for no budgets', () => {
    expect(budgetsAtOrAbove([], 90)).toEqual([]);
  });
});

describe('withSpend / budgetsByCategory', () => {
  const budgets = [
    { id: 'b1', category: 'Groceries', monthly_limit: 100 },
    { id: 'b2', category: 'Dining', monthly_limit: 50 },
  ];

  it('attaches spend per category, defaulting to 0', () => {
    expect(withSpend(budgets, { Groceries: 42, Transport: 9 })).toEqual([
      { id: 'b1', category: 'Groceries', monthly_limit: 100, spent: 42 },
      { id: 'b2', category: 'Dining', monthly_limit: 50, spent: 0 },
    ]);
  });

  it('indexes budgets by category (last wins)', () => {
    const dup = [...budgets, { id: 'b3', category: 'Dining', monthly_limit: 75 }];
    const index = budgetsByCategory(dup);
    expect(index.Groceries.id).toBe('b1');
    expect(index.Dining.id).toBe('b3');
    expect(budgetsByCategory([])).toEqual({});
  });
});

describe('greetingFor', () => {
  const at = (hour: number, minute = 0) => new Date(2026, 8, 15, hour, minute, 0, 0);

  it.each([
    [0, 'Good evening'],
    [1, 'Good evening'],
    [4, 'Good evening'],
    [5, 'Good morning'],
    [6, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [16, 'Good afternoon'],
    [17, 'Good evening'],
    [21, 'Good evening'],
    [22, 'Good evening'],
    [23, 'Good evening'],
  ])('hour %i -> %s', (hour, expected) => {
    expect(greetingFor(at(hour))).toBe(expected);
  });

  it.each([
    [4, 59, 'Good evening'],
    [11, 59, 'Good morning'],
    [16, 59, 'Good afternoon'],
    [21, 59, 'Good evening'],
  ])('%i:%i -> %s (last minute before a boundary)', (hour, minute, expected) => {
    expect(greetingFor(at(hour, minute))).toBe(expected);
  });

  it('covers every hour of the day', () => {
    const seen = new Set<string>();
    for (let h = 0; h < 24; h++) seen.add(greetingFor(at(h)));
    expect([...seen].sort()).toEqual(['Good afternoon', 'Good evening', 'Good morning']);
  });

  describe('with a name', () => {
    it.each([
      [9, 'Adrian Schtivelmager', 'Good morning, Adrian'],
      [14, 'Adrian', 'Good afternoon, Adrian'],
      [19, '  Adrian   Schtivelmager ', 'Good evening, Adrian'],
      [19, 'אדריאן שטיבלמגר', 'Good evening, אדריאן'],
    ])('hour %i, name %p -> %p', (hour, name, expected) => {
      expect(greetingFor(at(hour), name)).toBe(expected);
    });

    it.each([null, undefined, '', '   '])('adds no name for %p', (name) => {
      expect(greetingFor(at(19), name)).toBe('Good evening');
    });
  });
});

describe('categoryTotals / sortedCategoryTotals with custom categories', () => {
  // What useCategories().canonicalName does once the user's list is loaded:
  // known names (any casing) -> the category's name; unknown -> Other.
  const known = ['Groceries', 'Dining', 'Transport', 'Entertainment', 'Health', 'Other', 'Pets', 'Gifts'];
  const groupAs = (name: string) => known.find((k) => k.toLowerCase() === name.trim().toLowerCase()) ?? 'Other';

  const receipts = [
    receipt('r1', {
      items: [
        { name: 'Kibble', amount: 40, category: 'Pets' },
        { name: 'Toy', amount: 10, category: 'pets' },
        { name: 'Milk', amount: 8, category: 'Groceries' },
      ],
    }),
    receipt('r2', {
      items: [
        { name: 'Card', amount: 15, category: 'Gifts' },
        { name: 'Old thing', amount: 7, category: 'Deleted Category' },
        { name: 'Misc', amount: 3, category: 'Other' },
      ],
    }),
  ];

  it('groups custom names under their own category (case-insensitively) and folds unknown names into Other', () => {
    expect(categoryTotals(receipts, groupAs)).toEqual({ Pets: 50, Groceries: 8, Gifts: 15, Other: 10 });
    expect(sortedCategoryTotals(receipts, groupAs)).toEqual([
      { category: 'Pets', spent: 50 },
      { category: 'Gifts', spent: 15 },
      { category: 'Other', spent: 10 },
      { category: 'Groceries', spent: 8 },
    ]);
  });

  it('without a grouping keeps every name as stored (custom names are never lumped into Other)', () => {
    expect(categoryTotals(receipts)).toEqual({
      Pets: 40,
      pets: 10,
      Groceries: 8,
      Gifts: 15,
      'Deleted Category': 7,
      Other: 3,
    });
  });
});
