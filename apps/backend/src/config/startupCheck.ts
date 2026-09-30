// Side-effect module: imported by src/index.ts right after dotenv and BEFORE
// anything that reads secrets (the shared Supabase client throws its own,
// less helpful error at import time). Fails fast with one aggregated message
// listing every missing/invalid variable, so a misconfigured Cloud Run
// revision crashes on boot instead of serving 500s.
import { assertValidEnv } from './env';

try {
  assertValidEnv(process.env);
} catch (err) {
  console.error(`FATAL: ${(err as Error).message}`);
  throw err;
}
