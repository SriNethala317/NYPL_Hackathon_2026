import { isConfigured, loadProfile, saveDocument, deleteMyData, signOut } from '@/features/backend';

import type { DocumentTypeId } from '@/data/document-types';
import type { FieldCandidate } from '@/data/reconcile';

/**
 * Keeping the profile on the server, without letting the server hold the app up.
 *
 * Every function here is deliberately fire-and-forget and swallows its own failures. That is not
 * carelessness — it is the whole design constraint. Somebody standing in a benefits office with
 * one bar of signal must still be able to photograph a pay stub, see it read, and print a form.
 * A save that fails should cost them the convenience of the data being there next time, never the
 * thing they came to do.
 *
 * The app is therefore fully usable with no Supabase project at all: `isConfigured()` is false,
 * every call below returns immediately, and state simply lives in memory for the session.
 *
 * What this file will not do is pretend. A failed save is reported through `onError` so the UI can
 * say "we could not save that" rather than showing a tick and losing it.
 */

export type SyncDocument = {
  id: string;
  kind: DocumentTypeId;
  status: string;
  confidence?: number;
  readAt?: string;
};

export type PersistenceEvents = {
  /** Called with what the server had, once, after sign-in. */
  onHydrate: (data: {
    documents: { id: string; kind: DocumentTypeId; status: string; confidence?: number; readAt?: string }[];
    candidates: FieldCandidate[];
    applications: { programId: string; reference: string; date: string; stage: number }[];
  }) => void;
  /** Called when something did not save, so the UI can be honest about it. */
  onError?: (message: string) => void;
};

/** Whether persistence is available at all. The UI uses this to describe reality, not intent. */
export function persistenceAvailable(): boolean {
  return isConfigured();
}

/**
 * Pulls whatever this user already had.
 *
 * Runs once at startup. Returns silently when there is no project configured, which is the normal
 * state for a fresh checkout and must not look like an error.
 */
export async function hydrate(events: PersistenceEvents): Promise<void> {
  if (!isConfigured()) return;

  const result = await loadProfile();
  if (!result.ok) {
    // 'not-configured' is expected; anything else is worth surfacing.
    if (result.reason !== 'not-configured') events.onError?.(result.reason);
    return;
  }

  events.onHydrate(result.data);
}

/**
 * Saves a document and everything read from it.
 *
 * Called after the read succeeds, never before: a document that failed to read has nothing worth
 * storing, and writing a half-row would leave a permanent "reading…" entry in somebody's profile.
 */
export async function persistDocument(
  document: SyncDocument,
  candidates: FieldCandidate[],
  events?: Pick<PersistenceEvents, 'onError'>,
): Promise<void> {
  if (!isConfigured()) return;

  const result = await saveDocument(document, candidates);
  if (!result.ok && result.reason !== 'not-configured') {
    events?.onError?.(result.reason);
  }
}

/**
 * Erases everything, on the server as well as in memory.
 *
 * Both halves matter and the second is easy to forget. The session token lives in the iOS
 * Keychain, which survives deleting the app — so without `signOut()` a user who wipes their data,
 * deletes the app, and reinstalls it would be handed back the same account. Signing out is what
 * makes "delete everything" mean it.
 *
 * Returns whether the server delete actually succeeded, because a privacy promise this specific
 * must not report success it did not get.
 */
export async function eraseEverything(): Promise<{ ok: boolean; reason?: string }> {
  if (!isConfigured()) return { ok: true };

  const result = await deleteMyData();
  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }

  await signOut();
  return { ok: true };
}
