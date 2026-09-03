import { ensureSession } from './auth';
import { supabase } from './supabase';

/**
 * Getting a row to attach data to, without ever asking for one.
 *
 * `ensureSession()` only gets an `auth.uid()` — nothing creates this app's own `users` row or the
 * `applicant_profiles` row every applicant-scoped table hangs off of. This does both, in order,
 * and is safe to call on every write: the `users` row is upserted on `auth_user_id`, and an
 * existing `applicant_profiles` row is reused rather than replaced, so a second call can never
 * overwrite real profile data (name, DOB, ...) with a fresh blank one.
 *
 * The `applicant_profiles` row created here is intentionally empty — no name, DOB, phone, or
 * email. Those are populated later, field by field, as documents are read and `saveDocument`
 * writes what they yielded (see `20260101000006_relax_applicant_identity_fields.sql`).
 */

export type BootstrapOutcome = { ok: true; applicantId: string } | { ok: false; reason: string };

export async function ensureApplicant(): Promise<BootstrapOutcome> {
  const db = supabase();
  if (!db) return { ok: false, reason: 'not-configured' };

  const session = await ensureSession();
  if (!session.ok) return { ok: false, reason: session.detail };

  const { data: user, error: userError } = await db
    .from('users')
    .upsert({ auth_user_id: session.session.userId }, { onConflict: 'auth_user_id' })
    .select('id')
    .single();
  if (userError || !user) {
    return { ok: false, reason: userError?.message ?? 'Could not create the account record.' };
  }

  const { data: existing, error: lookupError } = await db
    .from('applicant_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (lookupError) return { ok: false, reason: lookupError.message };
  if (existing) return { ok: true, applicantId: existing.id };

  const { data: created, error: insertError } = await db
    .from('applicant_profiles')
    .insert({ user_id: user.id })
    .select('id')
    .single();
  if (insertError || !created) {
    return { ok: false, reason: insertError?.message ?? 'Could not create the applicant profile.' };
  }

  return { ok: true, applicantId: created.id };
}
