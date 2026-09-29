// One-off backfill behind scripts/normalize-receipt-dates.ts: rewrites every
// receipts.raw_response.date that isn't ISO "YYYY-MM-DD" to its normalized
// value (see receiptDate.ts). Dry-run unless `apply` is set. Kept here, with
// the client injected, so the logic is unit-tested without a database.
import { DateFix, planDateFixes } from './receiptDate';

export const BACKFILL_PAGE_SIZE = 500;

interface ReceiptRow {
  id: string;
  raw_response: Record<string, unknown> | null;
}

type QueryResult<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;

/** The slice of the Supabase client this backfill uses (the service-role client in the script). */
export interface BackfillClient {
  from(table: 'receipts'): {
    select(columns: string): {
      order(column: string, options: { ascending: boolean }): {
        range(from: number, to: number): QueryResult<ReceiptRow[]>;
      };
    };
    update(values: { raw_response: Record<string, unknown> }): {
      eq(column: 'id', value: string): QueryResult<unknown>;
    };
  };
}

export interface BackfillOptions {
  apply: boolean;
  log: (line: string) => void;
  pageSize?: number;
}

export interface BackfillSummary {
  scanned: number;
  fixes: DateFix[];
  updated: number;
  failed: number;
}

function show(value: unknown): string {
  return value === null ? 'null' : typeof value === 'string' ? value : JSON.stringify(value);
}

export async function runDateBackfill(client: BackfillClient, options: BackfillOptions): Promise<BackfillSummary> {
  const { apply, log } = options;
  const pageSize = options.pageSize ?? BACKFILL_PAGE_SIZE;

  // Read everything first, then write: updating while paging could shift pages.
  const rows: ReceiptRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from('receipts')
      .select('id, raw_response')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Failed to read receipts: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  const fixes = planDateFixes(rows);
  const byId = new Map(rows.map((row) => [row.id, row]));

  log(`${apply ? 'APPLY' : 'DRY RUN'}: scanned ${rows.length} receipt(s), ${fixes.length} date(s) to normalize`);
  if (fixes.length > 0) log('id | old | new');
  for (const fix of fixes) log(`${fix.id} | ${show(fix.old)} | ${show(fix.new)}`);

  let updated = 0;
  let failed = 0;
  if (apply) {
    for (const fix of fixes) {
      // planDateFixes only returns rows with an object raw_response.
      const raw = byId.get(fix.id)!.raw_response!;
      const { error } = await client
        .from('receipts')
        .update({ raw_response: { ...raw, date: fix.new } })
        .eq('id', fix.id);
      if (error) {
        failed += 1;
        log(`FAILED ${fix.id}: ${error.message}`);
      } else {
        updated += 1;
      }
    }
    log(`Updated ${updated}, failed ${failed}`);
  } else if (fixes.length > 0) {
    log('Nothing written. Re-run with --apply to update these rows.');
  }

  return { scanned: rows.length, fixes, updated, failed };
}
