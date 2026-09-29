import { isIsoReceiptDate, isoFromParts, normalizeReceiptDate, planDateFixes } from '../services/receiptDate';

describe('normalizeReceiptDate', () => {
  describe('ISO YYYY-MM-DD', () => {
    it.each([
      ['2026-08-17', '2026-08-17'],
      ['2026-01-01', '2026-01-01'],
      ['2026-12-31', '2026-12-31'],
      ['2024-02-29', '2024-02-29'], // leap year
      ['2000-02-29', '2000-02-29'], // divisible by 400 → leap
      ['1900-01-01', '1900-01-01'], // lower bound
      ['2100-12-31', '2100-12-31'], // upper bound
    ])('keeps a real date %s', (input, expected) => {
      expect(normalizeReceiptDate(input)).toBe(expected);
    });

    it.each([
      '2026-02-29', // not a leap year
      '1900-02-29', // divisible by 100 but not 400
      '2026-04-31', // April has 30 days
      '2026-06-31',
      '2026-09-31',
      '2026-11-31',
      '2026-02-30',
      '2026-13-01',
      '2026-00-10',
      '2026-01-00',
      '2026-01-32',
      '1899-12-31', // below range
      '2101-01-01', // above range
      '0000-01-01',
    ])('rejects impossible or out-of-range %s', (input) => {
      expect(normalizeReceiptDate(input)).toBeNull();
    });

    it.each(['2026-8-17', '2026/08/17', '20260817', '2026-08-17x', 'x2026-08-17'])(
      'rejects non-canonical ISO-like %s',
      (input) => {
        expect(normalizeReceiptDate(input)).toBeNull();
      }
    );
  });

  it('reads a 2-digit-year string day-first even if it looks like YY-MM-DD', () => {
    expect(normalizeReceiptDate('26-08-17')).toBe('2017-08-26');
  });

  describe('ISO date-time', () => {
    it.each([
      ['2026-08-17T10:30:00Z', '2026-08-17'],
      ['2026-08-17T23:59', '2026-08-17'],
      ['2026-08-17T00:00:00.000+03:00', '2026-08-17'],
      ['2026-08-17T10:30:00-0500', '2026-08-17'],
    ])('uses the date part of %s', (input, expected) => {
      expect(normalizeReceiptDate(input)).toBe(expected);
    });

    it('rejects a date-time whose date is impossible', () => {
      expect(normalizeReceiptDate('2026-02-30T10:00:00Z')).toBeNull();
    });

    it('rejects a malformed time part', () => {
      expect(normalizeReceiptDate('2026-08-17Tnoon')).toBeNull();
    });
  });

  describe('day-first (Israeli) formats', () => {
    it.each([
      ['17/08/2026', '2026-08-17'], // the real failing receipt
      ['17.08.2026', '2026-08-17'],
      ['17-08-2026', '2026-08-17'],
      ['7/8/2026', '2026-08-07'], // single-digit day and month
      ['07/08/2026', '2026-08-07'],
      ['01/02/2026', '2026-02-01'], // ambiguous in the US — always day-first here
      ['12/01/2026', '2026-01-12'],
      ['31/12/2026', '2026-12-31'],
      ['1/1/2026', '2026-01-01'],
      ['29/02/2024', '2024-02-29'],
      ['30/04/2026', '2026-04-30'],
    ])('converts %s → %s', (input, expected) => {
      expect(normalizeReceiptDate(input)).toBe(expected);
    });

    it.each([
      ['17/08/26', '2026-08-17'],
      ['17.08.26', '2026-08-17'],
      ['17-08-26', '2026-08-17'],
      ['01/01/00', '2000-01-01'],
      ['31/12/99', '2099-12-31'],
      ['29/02/24', '2024-02-29'],
    ])('reads a 2-digit year as 20YY: %s → %s', (input, expected) => {
      expect(normalizeReceiptDate(input)).toBe(expected);
    });

    it.each([
      '31/04/2026', // April has 30 days
      '31/06/2026',
      '29/02/2026', // not a leap year
      '29/02/26',
      '30/02/2024',
      '00/08/2026',
      '17/00/2026',
      '17/13/2026',
      '32/01/2026',
      '08/17/2026', // US month-first: month 17 doesn't exist
      '17/08/1899',
      '17/08/2101',
    ])('rejects impossible %s', (input) => {
      expect(normalizeReceiptDate(input)).toBeNull();
    });

    it.each(['17/08-2026', '17.08/2026', '17-08.26'])('rejects mixed separators %s', (input) => {
      expect(normalizeReceiptDate(input)).toBeNull();
    });

    it.each(['117/08/2026', '17/008/2026', '17/08/026', '17/08/20266', '17/08', '17 08 2026'])(
      'rejects malformed %s',
      (input) => {
        expect(normalizeReceiptDate(input)).toBeNull();
      }
    );
  });

  describe('whitespace', () => {
    it.each([
      ['  2026-08-17  ', '2026-08-17'],
      ['\t17/08/2026\n', '2026-08-17'],
      [' 17.08.26 ', '2026-08-17'],
    ])('trims %j', (input, expected) => {
      expect(normalizeReceiptDate(input)).toBe(expected);
    });

    it('rejects inner whitespace', () => {
      expect(normalizeReceiptDate('17 / 08 / 2026')).toBeNull();
    });
  });

  describe('junk', () => {
    it.each([
      '',
      '   ',
      'today',
      'Aug 17, 2026',
      '17 August 2026',
      '17 באוגוסט 2026',
      'null',
      '2026',
      '17/08/2026 10:30', // time after a day-first date isn't accepted
    ])('rejects %j', (input) => {
      expect(normalizeReceiptDate(input)).toBeNull();
    });

    it.each([null, undefined, 20260817, {}, [], true, new Date(2026, 7, 17)])('rejects non-string %p', (input) => {
      expect(normalizeReceiptDate(input)).toBeNull();
    });
  });
});

describe('isoFromParts', () => {
  it('pads and formats a real date', () => {
    expect(isoFromParts(2026, 8, 7)).toBe('2026-08-07');
  });

  it('rejects non-integers', () => {
    expect(isoFromParts(2026.5, 8, 7)).toBeNull();
    expect(isoFromParts(2026, 8.5, 7)).toBeNull();
    expect(isoFromParts(2026, 8, NaN)).toBeNull();
  });

  it('uses the right month lengths across the year', () => {
    const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    lengths.forEach((days, i) => {
      expect(isoFromParts(2026, i + 1, days)).not.toBeNull();
      expect(isoFromParts(2026, i + 1, days + 1)).toBeNull();
    });
  });
});

describe('isIsoReceiptDate', () => {
  it('is true only for a valid canonical ISO date', () => {
    expect(isIsoReceiptDate('2026-08-17')).toBe(true);
    expect(isIsoReceiptDate('2026-02-30')).toBe(false);
    expect(isIsoReceiptDate(' 2026-08-17')).toBe(false); // would need rewriting
    expect(isIsoReceiptDate('17/08/2026')).toBe(false);
    expect(isIsoReceiptDate('2026-08-17T10:00:00Z')).toBe(false);
    expect(isIsoReceiptDate(null)).toBe(false);
  });
});

describe('planDateFixes', () => {
  const row = (id: string, raw_response: unknown) => ({ id, raw_response });

  it('plans a fix for each non-ISO date and skips ISO, missing and null dates', () => {
    const fixes = planDateFixes([
      row('a', { date: '17/08/2026', total: 350 }),
      row('b', { date: '2026-08-17' }),
      row('c', { date: null }),
      row('d', { total: 1 }),
      row('e', { date: '31/04/2026' }),
      row('f', { date: ' 2026-09-01 ' }),
      row('g', { date: '2026-09-01T08:00:00Z' }),
      row('h', { date: 20260817 }),
    ]);

    expect(fixes).toEqual([
      { id: 'a', old: '17/08/2026', new: '2026-08-17' },
      { id: 'e', old: '31/04/2026', new: null },
      { id: 'f', old: ' 2026-09-01 ', new: '2026-09-01' },
      { id: 'g', old: '2026-09-01T08:00:00Z', new: '2026-09-01' },
      { id: 'h', old: 20260817, new: null },
    ]);
  });

  it('skips rows without a usable raw_response', () => {
    expect(planDateFixes([row('a', null), row('b', undefined), row('c', 'oops')])).toEqual([]);
  });

  it('returns nothing for an empty table', () => {
    expect(planDateFixes([])).toEqual([]);
  });
});
