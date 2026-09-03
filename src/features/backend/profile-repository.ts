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

  /*
   * Inserted, never upserted.
   *
   * An earlier version wrote one row per (user, field) and upserted onto a unique constraint, so
   * the second document that mentioned a field silently overwrote the first. That made it
   * impossible for two documents to disagree in the database, which quietly disabled every
   * conflict the reconciliation rules exist to surface — a passport and a pay stub spelling a name
   * differently is precisely what the app is supposed to ask about.
   *
   * `document_type_id` is written explicitly rather than left to a join. Reconciliation ranks
   * candidates by which kind of document they came from, and a candidate that cannot say what it
   * came from is not a weaker candidate — `authorityRank` returns Infinity for 'unknown' and it is
   * discarded entirely.
   */
  const { error: fieldError } = await db.from('field_candidates').insert(
    candidates.map((candidate) => ({
      user_id: userId,
      document_id: document.id,
      field_key: candidate.field,
      document_type_id: candidate.documentType,
      value: candidate.value,
      confidence: candidate.confidence,
      read_at: new Date(candidate.readAt).toISOString(),
    })),
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
    db.from('field_candidates').select('*'),
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
      /*
       * Every candidate comes back whole, including the kind of document it was read from.
       *
       * An earlier version hardcoded `documentType: 'unknown'` here with a comment calling it a
       * harmless default. It was not harmless: `authorityRank` returns Infinity for 'unknown',
       * `resolveField` drops every candidate that scores Infinity, and so a profile reloaded from
       * the server resolved to nothing — the app would sign in, fetch a full set of fields, and
       * show an empty Profile with no error anywhere.
       */
      candidates: (fields.data ?? []).map((row) => ({
        field: row.field_key as ProfileFieldKey,
        value: row.value,
        documentId: row.document_id,
        documentType: row.document_type_id as DocumentTypeId,
        confidence: row.confidence,
        readAt: Date.parse(row.read_at) || 0,
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
