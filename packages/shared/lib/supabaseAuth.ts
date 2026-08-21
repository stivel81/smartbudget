import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing required Supabase environment variables: SUPABASE_URL and SUPABASE_SERVICE_KEY');
}

// Dedicated client for verifying user access tokens (auth.getUser(token))
// in requireAuth. Calling getUser(token) on the shared service-role
// `supabase` client (lib/supabase.ts) mutates that client's internal
// GoTrueClient session state, which then makes its *later* queries run
// under the caller's RLS context instead of the service role — silently
// dropping writes to any table without a matching RLS policy (e.g. UPDATE
// on `receipts`, which only has SELECT/INSERT policies). A separate client
// instance keeps that mutation isolated from the client used for DB/storage
// access.
export const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  realtime: {
    // Node 20 has no native WebSocket global (added in Node 22); supply `ws` explicitly.
    transport: WebSocket as any,
  },
});
