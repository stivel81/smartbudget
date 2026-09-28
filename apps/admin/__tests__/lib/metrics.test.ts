import {
  HAIKU_INPUT_COST_PER_TOKEN,
  HAIKU_OUTPUT_COST_PER_TOKEN,
  avgCostPerScan,
  claudeCostUsd,
  countNewSince,
  donutDashOffset,
  isoDay,
  lastNDays,
  monthCostUsd,
  signupsByDay,
  successRatePercent,
  todayUsage,
} from '../../lib/metrics';

const NOW = new Date('2026-03-04T15:30:00Z');

describe('isoDay', () => {
  it('returns the UTC date', () => {
    expect(isoDay(NOW)).toBe('2026-03-04');
    // 23:30 at UTC-5 is already the next day in UTC.
    expect(isoDay(new Date('2026-03-04T23:30:00-05:00'))).toBe('2026-03-05');
  });
});

describe('lastNDays', () => {
  it('returns n days oldest-first ending today', () => {
    expect(lastNDays(NOW, 7)).toEqual([
      '2026-02-26',
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
    ]);
  });

  it('handles leap years and year boundaries', () => {
    expect(lastNDays(new Date('2028-03-01T00:00:00Z'), 2)).toEqual(['2028-02-29', '2028-03-01']);
    expect(lastNDays(new Date('2027-01-01T12:00:00Z'), 2)).toEqual(['2026-12-31', '2027-01-01']);
  });

  it('returns an empty list for n = 0', () => {
    expect(lastNDays(NOW, 0)).toEqual([]);
  });
});

describe('claudeCostUsd', () => {
  it('prices input at $1/MTok and output at $5/MTok', () => {
    expect(HAIKU_INPUT_COST_PER_TOKEN).toBeCloseTo(0.000001);
    expect(HAIKU_OUTPUT_COST_PER_TOKEN).toBeCloseTo(0.000005);
    expect(claudeCostUsd(1_000_000, 0)).toBeCloseTo(1);
    expect(claudeCostUsd(0, 1_000_000)).toBeCloseTo(5);
    expect(claudeCostUsd(1500, 300)).toBeCloseTo(0.003);
    expect(claudeCostUsd(0, 0)).toBe(0);
  });
});

describe('signupsByDay', () => {
  it('buckets users into the last 7 UTC days and ignores older/future ones', () => {
    const users = [
      { created_at: '2026-03-04T01:00:00Z' },
      { created_at: '2026-03-04T23:59:59Z' },
      { created_at: '2026-03-01T10:00:00Z' },
      { created_at: '2026-02-26T00:00:00Z' },
      { created_at: '2026-02-25T23:59:59Z' }, // 8 days ago — excluded
      { created_at: '2026-03-05T00:00:00Z' }, // tomorrow — excluded
    ];
    expect(signupsByDay(users, NOW)).toEqual([
      { day: '2026-02-26', count: 1 },
      { day: '2026-02-27', count: 0 },
      { day: '2026-02-28', count: 0 },
      { day: '2026-03-01', count: 1 },
      { day: '2026-03-02', count: 0 },
      { day: '2026-03-03', count: 0 },
      { day: '2026-03-04', count: 2 },
    ]);
  });

  it('supports a custom window', () => {
    expect(signupsByDay([{ created_at: '2026-03-03T00:00:00Z' }], NOW, 2)).toEqual([
      { day: '2026-03-03', count: 1 },
      { day: '2026-03-04', count: 0 },
    ]);
  });
});

describe('countNewSince', () => {
  it('counts users created in the last 7×24h (inclusive of the cutoff)', () => {
    const users = [
      { created_at: '2026-02-25T15:30:00Z' }, // exactly 7 days ago — included
      { created_at: '2026-02-25T15:29:59Z' }, // just outside
      { created_at: '2026-03-04T15:00:00Z' },
    ];
    expect(countNewSince(users, NOW)).toBe(2);
    expect(countNewSince(users, NOW, 1)).toBe(1);
    expect(countNewSince([], NOW)).toBe(0);
  });
});

describe('todayUsage', () => {
  const byDay = [
    { date: '2026-03-04', scans: 4, inputTokens: 4000, outputTokens: 800 },
    { date: '2026-03-03', scans: 10, inputTokens: 10000, outputTokens: 2000 },
  ];

  it("returns today's scans and cost", () => {
    const res = todayUsage(byDay, NOW);
    expect(res.scans).toBe(4);
    expect(res.costUsd).toBeCloseTo(0.008);
  });

  it('returns zeros when there is no entry for today', () => {
    expect(todayUsage(byDay, new Date('2026-03-05T00:00:00Z'))).toEqual({ scans: 0, costUsd: 0 });
  });
});

describe('monthCostUsd', () => {
  it('sums only the current UTC month', () => {
    const byDay = [
      { date: '2026-03-04', scans: 1, inputTokens: 1_000_000, outputTokens: 0 }, // $1
      { date: '2026-03-01', scans: 1, inputTokens: 0, outputTokens: 1_000_000 }, // $5
      { date: '2026-02-28', scans: 1, inputTokens: 5_000_000, outputTokens: 0 }, // Feb — excluded
      { date: '2025-03-04', scans: 1, inputTokens: 5_000_000, outputTokens: 0 }, // last year — excluded
    ];
    expect(monthCostUsd(byDay, NOW)).toBeCloseTo(6);
  });

  it('returns 0 with no usage', () => {
    expect(monthCostUsd([], NOW)).toBe(0);
  });
});

describe('avgCostPerScan', () => {
  it('divides cost by scans, guarding against zero', () => {
    expect(avgCostPerScan(1, 4)).toBe(0.25);
    expect(avgCostPerScan(1, 0)).toBe(0);
  });
});

describe('successRatePercent', () => {
  it('rounds to a whole percentage', () => {
    expect(successRatePercent(2, 1)).toBe(67);
    expect(successRatePercent(1, 2)).toBe(33);
    expect(successRatePercent(10, 0)).toBe(100);
    expect(successRatePercent(0, 5)).toBe(0);
  });

  it('shows 100% when there is no data yet', () => {
    expect(successRatePercent(0, 0)).toBe(100);
  });
});

describe('donutDashOffset', () => {
  it('is the full circumference at 0% and 0 at 100%', () => {
    const c = 2 * Math.PI * 30;
    expect(donutDashOffset(0, 30)).toBeCloseTo(c);
    expect(donutDashOffset(100, 30)).toBeCloseTo(0);
    expect(donutDashOffset(75, 30)).toBeCloseTo(c / 4);
  });
});
