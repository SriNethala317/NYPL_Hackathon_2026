export const SUPABASE_CONFIG = {
  url: process.env.SUPABASE_URL,
  /**
   * Service role, not anon: `income_eligibility`, `basic_eligibility_filters`, and
   * `eligibility_rules` have RLS enabled with zero policies at all (confirmed live) — the anon key
   * the mobile app uses cannot read them, by design. `backend/` is a trusted server process, not a
   * public client, so reading with elevated access here does not call for new RLS policies; it's
   * the same posture `scripts/push-catalogue.mjs` already uses for the one other place this
   * project reads/writes these tables outside a signed-in applicant's own session.
   */
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
} as const;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_CONFIG.url && SUPABASE_CONFIG.serviceRoleKey);
}
