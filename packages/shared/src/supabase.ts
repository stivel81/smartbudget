import { createClient, type SupabaseClientOptions } from '@supabase/supabase-js';

export function createSupabaseClient(
  url: string | undefined,
  key: string | undefined,
  options?: SupabaseClientOptions<'public'>
) {
  if (!url || !key) {
    throw new Error('Supabase URL and key are required to create a client.');
  }
  return createClient(url, key, options);
}

export type { SupabaseClient } from '@supabase/supabase-js';
