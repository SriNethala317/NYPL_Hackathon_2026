import { ensureSession } from './auth';
import { supabase } from './supabase';

import type { ProfileFieldKey } from '@/data/profile-fields';
import type { FieldCandidate } from '@/data/reconcile';
import type { DocumentTypeId } from '@/data/document-types';

/**
 * Reading and writing the applicant's profile.
 *
 * Note what is not here: no document bytes, no image URLs, no storage bucket. A document is read,
 * the fields it yielded are written, and the original is discarded — the schema has nowhere to
 * put a file even if this code tried. That is the IDNYC posture, and it is what makes the promise
 * on the privacy screen checkable rather than aspirational.
 *
 * Every function degrades to a no-op when Supabase is not configured, because the app has to keep
 * working without it. Failures are returned, never thrown: losing a save is bad, and crashing
 * somebody's benefits application over it is worse.
 */

export type PersistedDocument = {
  id: string;
  kind: DocumentTypeId;
  status: string;
  confidence?: number;
  readAt?: string;
};

export type PersistedProfile = {
  documents: PersistedDocument[];
  candidates: FieldCandidate[];
  applications: {
    programId: string;
    reference: string;
    date: string;
    stage: number;
  }[];
};

export type RepoOutcome<T> = { ok: true; data: T } | { ok: false; reason: string };

/** Confirms the backend is reachable, signed in, and migrated. Used by the diagnostics screen. */
export async function checkBackend(): Promise<
  RepoOutcome<{ userId: string; anonymous: boolean; programmes: number }>
> {
  const db = supabase();
  if (!db) return { ok: false, reason: 'No Supabase project is connected.' };

  const session = await ensureSession();
  if (!session.ok) return { ok: false, reason: session.detail };

  // Counting the public catalogue proves the migration ran and RLS lets an anonymous user read
  // it — the two things most likely to be wrong on a fresh project.
  const { count, error } = await db.from('programs').select('id', { count: 'exact', head: true });
  if (error) {
    return {
      ok: false,
      reason: `${error.message} — has supabase/migrations/0001_initial.sql been applied?`,
    };
  }

  return {
    ok: true,
    data: { userId: session.session.userId, anonymous: session.session.anonymous, programmes: count ?? 0 },
  };
}

/**
 * Saves the fields a document yielded.
 *
 * Written as candidates rather than resolved values: reconciliation decides which of several
 * documents wins, and that decision has to stay reproducible. Storing only the winner would lose
 * the provenance the app shows on the form.
 */
export async function saveDocument(
  document: PersistedDocument,
  candidates: FieldCandidate[],
): Promise<RepoOutcome<null>> {
  const db = supabase();
  if (!db) return { ok: false, reason: 'not-configured' };

  const session = await ensureSession();
  if (!session.ok) return { ok: false, reason: session.detail };
  const userId = session.session.userId;

  const { error: docError } = await db.from('documents').upsert(
    {
      id: document.id,
      user_id: userId,
      kind: document.kind,
      status: document.status,
      confidence: document.confidence ?? null,
      read_at: document.readAt ?? null,
    },
    { onConflict: 'id' },
  );
  if (docError) return { ok: false, reason: docError.message };

  if (candidates.length === 0) return { ok: true, data: null };

  // One row per field, keyed on (user, field): the newest read of a field replaces the old one,
  // which is what `unique (user_id, key)` in the schema enforces.
  const { error: fieldError } = await db.from('profile_fields').upsert(
    candidates.map((candidate) => ({
      user_id: userId,
      key: candidate.field,
      value: candidate.value,
      source_document_id: document.id,
      confidence: candidate.confidence,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'user_id,key' },
  );
  if (fieldError) return { ok: false, reason: fieldError.message };

  return { ok: true, data: null };
}

/** Everything this user has on file. */
export async function loadProfile(): Promise<RepoOutcome<PersistedProfile>> {
  const db = supabase();
  if (!db) return { ok: false, reason: 'not-configured' };

  const session = await ensureSession();
  if (!session.ok) return { ok: false, reason: session.detail };

  const [documents, fields, applications] = await Promise.all([
    db.from('documents').select('*'),
    db.from('profile_fields').select('*'),
    db.from('applications').select('*'),
  ]);

  const failure = documents.error ?? fields.error ?? applications.error;
  if (failure) return { ok: false, reason: failure.message };

  return {
    ok: true,
    data: {
      documents: (documents.data ?? []).map((row) => ({
        id: row.id,
        kind: row.kind,
        status: row.status,
        confidence: row.confidence ?? undefined,
        readAt: row.read_at ?? undefined,
      })),
      candidates: (fields.data ?? []).map((row) => ({
        field: row.key as ProfileFieldKey,
        value: row.value,
        documentId: row.source_document_id ?? '',
        // The document type is recoverable from the joined document; defaulting keeps the shape
        // valid when a document has been removed but its field has not yet been cleaned up.
        documentType: 'unknown' as DocumentTypeId,
        confidence: row.confidence ?? 0.5,
        readAt: Date.parse(row.updated_at) || 0,
      })),
      applications: (applications.data ?? []).map((row) => ({
        programId: row.program_id,
        reference: row.reference,
        date: row.submitted_at,
        stage: row.stage,
      })),
    },
  };
}

/**
 * Erases everything this user has stored.
 *
 * Calls the `delete_my_data()` function rather than issuing deletes from the client, so the
 * ordering respects the foreign keys and the whole thing is one round trip. It runs as the
 * caller, so RLS still applies and it can only ever erase their own rows.
 */
export async function deleteMyData(): Promise<RepoOutcome<null>> {
  const db = supabase();
  if (!db) return { ok: false, reason: 'not-configured' };

  const session = await ensureSession();
  if (!session.ok) return { ok: false, reason: session.detail };

  const { error } = await db.rpc('delete_my_data');
  if (error) return { ok: false, reason: error.message };
  return { ok: true, data: null };
}
