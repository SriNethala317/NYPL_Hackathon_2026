import { SUPABASE_CONFIG, isSupabaseConfigured } from '@/config/supabase.config';

/**
 * A thin PostgREST client, not the `@supabase/supabase-js` SDK — `backend/` has no Supabase
 * dependency today, and this only ever needs a handful of read-only `select` queries with the
 * service role key. Same approach `scripts/push-catalogue.mjs`/`scripts/check-supabase.mjs`
 * already use elsewhere in this project, rather than introducing a new dependency for one feature.
 */

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.');
    this.name = 'SupabaseNotConfiguredError';
  }
}

/**
 * A read-only PostgREST `select`. `query` is everything after `?` — e.g.
 * `"select=id,code,name&active=eq.true"`.
 */
export async function supabaseSelect<T>(table: string, query: string): Promise<T[]> {
  if (!isSupabaseConfigured()) throw new SupabaseNotConfiguredError();

  const response = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: SUPABASE_CONFIG.serviceRoleKey as string,
      Authorization: `Bearer ${SUPABASE_CONFIG.serviceRoleKey}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Supabase select on ${table} failed: ${response.status} ${response.statusText}\n${await response.text()}`);
  }
  return (await response.json()) as T[];
}
