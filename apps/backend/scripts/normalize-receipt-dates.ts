/**
 * Backfill: normalize receipts.raw_response.date to ISO "YYYY-MM-DD".
 *
 * Older scans stored the date exactly as printed on the receipt (Israeli
 * day/month/year, e.g. "17/08/2026"), which the apps can't place in a month,
 * so they fell back to the upload time. This rewrites every non-ISO date to
 * its day-first normalized value (or null when it can't be understood).
 *
 *   npm run normalize:receipt-dates             # dry run: prints id | old | new
 *   npm run normalize:receipt-dates -- --apply  # writes the changes
 *
 * Uses the service-role client (bypasses RLS) — it must see every user's rows.
 */
import 'dotenv/config';
import { supabase } from '@smartbudget/shared/lib/supabase';
import { BackfillClient, runDateBackfill } from '../src/services/receiptDateBackfill';

async function main() {
  const apply = process.argv.includes('--apply');
  const summary = await runDateBackfill(supabase as unknown as BackfillClient, {
    apply,
    log: (line) => console.log(line),
  });
  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
