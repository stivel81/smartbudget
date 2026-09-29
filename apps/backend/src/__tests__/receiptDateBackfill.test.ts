import { BackfillClient, runDateBackfill } from '../services/receiptDateBackfill';

type Row = { id: string; raw_response: Record<string, unknown> | null };

/** In-memory fake of the Supabase calls the backfill makes. */
function fakeClient(rows: Row[], opts: { readError?: string; failUpdateIds?: string[] } = {}) {
  const ranges: [number, number][] = [];
  const updates: { id: string; raw_response: Record<string, unknown> }[] = [];
  const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));

  const client: BackfillClient = {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (from: number, to: number) => {
            ranges.push([from, to]);
            if (opts.readError) return { data: null, error: { message: opts.readError } };
            return { data: sorted.slice(from, to + 1), error: null };
          },
        }),
      }),
      update: (values) => ({
        eq: async (_column, id) => {
          if (opts.failUpdateIds?.includes(id)) return { data: null, error: { message: 'boom' } };
          updates.push({ id, raw_response: values.raw_response });
          return { data: null, error: null };
        },
      }),
    }),
  };
  return { client, ranges, updates };
}

const ROWS: Row[] = [
  { id: 'r1', raw_response: { merchant: 'טיטניום בע"מ', total: 350, date: '17/08/2026', items: [] } },
  { id: 'r2', raw_response: { merchant: 'Rami Levy', total: 10, date: '2026-09-01', items: [] } },
  { id: 'r3', raw_response: { merchant: 'Bad', total: 5, date: '31/04/2026', items: [] } },
  { id: 'r4', raw_response: { merchant: 'NoDate', total: 5, date: null, items: [] } },
];

describe('runDateBackfill', () => {
  it('dry-run (default) prints id | old | new and writes nothing', async () => {
    const { client, updates } = fakeClient(ROWS);
    const lines: string[] = [];

    const summary = await runDateBackfill(client, { apply: false, log: (l) => lines.push(l) });

    expect(updates).toEqual([]);
    expect(summary).toEqual({
      scanned: 4,
      updated: 0,
      failed: 0,
      fixes: [
        { id: 'r1', old: '17/08/2026', new: '2026-08-17' },
        { id: 'r3', old: '31/04/2026', new: null },
      ],
    });
    expect(lines).toEqual([
      'DRY RUN: scanned 4 receipt(s), 2 date(s) to normalize',
      'id | old | new',
      'r1 | 17/08/2026 | 2026-08-17',
      'r3 | 31/04/2026 | null',
      'Nothing written. Re-run with --apply to update these rows.',
    ]);
  });

  it('with apply, updates only the planned rows and keeps the rest of raw_response', async () => {
    const { client, updates } = fakeClient(ROWS);
    const lines: string[] = [];

    const summary = await runDateBackfill(client, { apply: true, log: (l) => lines.push(l) });

    expect(updates).toEqual([
      { id: 'r1', raw_response: { merchant: 'טיטניום בע"מ', total: 350, date: '2026-08-17', items: [] } },
      { id: 'r3', raw_response: { merchant: 'Bad', total: 5, date: null, items: [] } },
    ]);
    expect(summary.updated).toBe(2);
    expect(lines[0]).toBe('APPLY: scanned 4 receipt(s), 2 date(s) to normalize');
    expect(lines[lines.length - 1]).toBe('Updated 2, failed 0');
  });

  it('pages through every row', async () => {
    const many: Row[] = Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, raw_response: { date: '01/02/2026' } }));
    const { client, ranges } = fakeClient(many);

    const summary = await runDateBackfill(client, { apply: false, log: () => {}, pageSize: 2 });

    expect(ranges).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
    expect(summary.scanned).toBe(5);
    expect(summary.fixes).toHaveLength(5);
  });

  it('stops after a full final page followed by an empty one', async () => {
    const four: Row[] = Array.from({ length: 4 }, (_, i) => ({ id: `r${i}`, raw_response: { date: '2026-01-01' } }));
    const { client, ranges } = fakeClient(four);

    await runDateBackfill(client, { apply: false, log: () => {}, pageSize: 2 });

    expect(ranges).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
  });

  it('reports nothing to do on a clean table', async () => {
    const { client } = fakeClient([ROWS[1], ROWS[3]]);
    const lines: string[] = [];

    await runDateBackfill(client, { apply: false, log: (l) => lines.push(l) });

    expect(lines).toEqual(['DRY RUN: scanned 2 receipt(s), 0 date(s) to normalize']);
  });

  it('counts and logs failed updates without stopping', async () => {
    const { client, updates } = fakeClient(ROWS, { failUpdateIds: ['r1'] });
    const lines: string[] = [];

    const summary = await runDateBackfill(client, { apply: true, log: (l) => lines.push(l) });

    expect(summary.failed).toBe(1);
    expect(summary.updated).toBe(1);
    expect(updates.map((u) => u.id)).toEqual(['r3']);
    expect(lines).toContain('FAILED r1: boom');
    expect(lines[lines.length - 1]).toBe('Updated 1, failed 1');
  });

  it('throws when receipts cannot be read', async () => {
    const { client } = fakeClient(ROWS, { readError: 'permission denied' });

    await expect(runDateBackfill(client, { apply: false, log: () => {} })).rejects.toThrow(
      'Failed to read receipts: permission denied'
    );
  });

  it('treats a null page as empty and prints non-string old values as JSON', async () => {
    const client: BackfillClient = {
      from: () => ({
        select: () => ({ order: () => ({ range: async () => ({ data: null, error: null }) }) }),
        update: () => ({ eq: async () => ({ data: null, error: null }) }),
      }),
    };
    expect((await runDateBackfill(client, { apply: false, log: () => {} })).scanned).toBe(0);

    const { client: numeric } = fakeClient([{ id: 'n1', raw_response: { date: 20260817 } }]);
    const lines: string[] = [];
    await runDateBackfill(numeric, { apply: false, log: (l) => lines.push(l) });
    expect(lines).toContain('n1 | 20260817 | null');
  });
});
