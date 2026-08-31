import { supabase } from './supabase';

/**
 * Getting an identity for row-level security, without asking for one.
 *
 * Every policy in `0001_initial.sql` is scoped to `auth.uid()`, so nothing persists until there
 * is a signed-in user. The obvious answer is an email sign-up, and for this audience it is the
 * wrong one: research on NYC benefits uptake found roughly 25,000 more eligible non-citizens left
 * the SNAP caseload than expected over three years, attributed to fear. Demanding contact details
 * before someone can even see what they qualify for reproduces exactly that barrier.
 *
 * So the default is an anonymous session. It gives RLS a real `auth.uid()` to scope to, the data
 * persists on that device, and we have asked for nothing. Linking an email later is offered — it
 * is what lets somebody move to a new phone — but it is a choice, not a gate.
 */

export type Session = {
  userId: string;
  /** True while the account has no email or phone attached to it. */
  anonymous: boolean;
};

export type AuthOutcome =
  | { ok: true; session: Session }
  | { ok: false; reason: 'not-configured' | 'failed'; detail: string };

/**
 * The session to work with, creating an anonymous one if needed.
 *
 * Safe to call repeatedly — an existing session is reused rather than replaced, which matters
 * because a second anonymous sign-in would silently orphan everything saved under the first.
 */
export async function ensureSession(): Promise<AuthOutcome> {
  const db = supabase();
  if (!db) {
    return { ok: false, reason: 'not-configured', detail: 'No Supabase project is connected.' };
  }

  const existing = await db.auth.getSession();
  if (existing.data.session) {
    const user = existing.data.session.user;
    return { ok: true, session: { userId: user.id, anonymous: !user.email && !user.phone } };
  }

  const { data, error } = await db.auth.signInAnonymously();
  if (error || !data.user) {
    return {
      ok: false,
      reason: 'failed',
      // Anonymous sign-in is off by default on new projects; naming that saves a long hunt.
      detail: `${error?.message ?? 'Sign-in failed'} — check that Anonymous sign-ins are enabled under Authentication → Providers.`,
    };
  }

  return { ok: true, session: { userId: data.user.id, anonymous: true } };
}

/**
 * Attaches an email to an anonymous account so its data can be reached from another device.
 *
 * Offered, never required. The account and everything in it already exist; this only adds a way
 * back to them.
 */
export async function linkEmail(email: string): Promise<AuthOutcome> {
  const db = supabase();
  if (!db) {
    return { ok: false, reason: 'not-configured', detail: 'No Supabase project is connected.' };
  }

  const { data, error } = await db.auth.updateUser({ email });
  if (error || !data.user) {
    return { ok: false, reason: 'failed', detail: error?.message ?? 'Could not link that email.' };
  }
  return { ok: true, session: { userId: data.user.id, anonymous: false } };
}

/** Ends the session on this device. Does not delete anything — that is `deleteMyData`. */
export async function signOut(): Promise<void> {
  await supabase()?.auth.signOut();
}
