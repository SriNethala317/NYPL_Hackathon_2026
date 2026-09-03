import { ensureApplicant } from './applicant-bootstrap';
import { ensureSession } from './auth';
import { supabase } from './supabase';

import { documentTypes, type DocumentTypeId } from '@/data/document-types';
import type { ProfileFieldKey } from '@/data/profile-fields';
import type { FieldCandidate } from '@/data/reconcile';

/**
 * Reading and writing the applicant's profile — rewritten against the schema in
 * `database/schema.sql` + `supabase/migrations/20260101000002` through `...000008`. The old
 * `programs`/`documents`/`field_candidates` tables and the `delete_my_data()` RPC this replaced
 * are gone; nothing here preserves their shape, only the function signatures callers depend on
 * (see `src/state/persistence.ts` and `src/features/extraction/extract-w2.ts`).
 *
 * Note what is still not here: no document bytes, no image URLs, no storage bucket. A document is
 * read, the fields it yielded are written, and the original is discarded — same posture as
 * before, just against `ocr_extractions`/`field_provenance` instead of `documents`/
 * `field_candidates`.
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

/**
 * `ocr_extractions.source_type` / `field_provenance.source_type` store the app's DocumentTypeId
 * values upper-cased (`drivers_license` -> `DRIVERS_LICENSE`), per
 * `20260101000008_widen_document_source_types.sql`. Case is the only transform needed both ways.
 */
const toSourceType = (kind: DocumentTypeId): string => kind.toUpperCase();
const fromSourceType = (sourceType: string): DocumentTypeId => sourceType.toLowerCase() as DocumentTypeId;

/**
 * `field_provenance.source_type` also carries non-document sources (`USER`, `SYSTEM`, `ADMIN`,
 * `APPLICATION`) that the schema reserves for values entered or generated outside the OCR
 * pipeline. Nothing in this file writes those yet, but `loadProfile` still has to not crash — or
 * worse, silently mint a fake `DocumentTypeId` — if it ever reads one back.
 */
const DOCUMENT_SOURCE_TYPES = new Set(documentTypes.map((d) => toSourceType(d.id)));

/**
 * Three stages the UI actually shows (`StageTracker`: Submitted -> In review -> Decision), mapped
 * from the schema's 12-value `applications.status`. Pre-submission statuses (`DRAFT` through
 * `USER_REVIEW`) fall back to stage 0 alongside `SUBMITTED` itself — there is no "not yet
 * submitted" stage in a 3-stage tracker, and `loadProfile` does not filter drafts out (the old
 * code did not either; the caller decides what to do with an unsubmitted application, if any ever
 * appear here).
 */
const APPLICATION_STAGE_BY_STATUS: Record<string, number> = {
  DRAFT: 0,
  IN_PROGRESS: 0,
  MISSING_INFORMATION: 0,
  READY_FOR_REVIEW: 0,
  USER_REVIEW: 0,
  SUBMITTED: 0,
  PROCESSING: 1,
  ACTION_REQUIRED: 1,
  APPROVED: 2,
  DENIED: 2,
  CANCELLED: 2,
  CLOSED: 2,
};
const stageForStatus = (status: string): number => APPLICATION_STAGE_BY_STATUS[status] ?? 0;

/** Confirms the backend is reachable, signed in, and migrated. Used by the diagnostics screen. */
export async function checkBackend(): Promise<
  RepoOutcome<{ userId: string; anonymous: boolean; programmes: number }>
> {
  const db = supabase();
  if (!db) return { ok: false, reason: 'No Supabase project is connected.' };

  const session = await ensureSession();
  if (!session.ok) return { ok: false, reason: session.detail };

  // Counting the public catalogue proves the migration ran and RLS lets an anonymous user read
  // it — the two things most likely to be wrong on a fresh project. No applicant identity is
  // needed for this: benefit_programs is public-read for every role.
  const { count, error } = await db
    .from('benefit_programs')
    .select('id', { count: 'exact', head: true });
  if (error) {
    return {
      ok: false,
      reason: `${error.message} — has supabase/migrations/20260101000001_base_schema.sql been applied?`,
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
 * One `ocr_extractions` row per document read, then one `field_provenance` row per candidate —
 * inserted, never upserted. That matters for the same reason it did against the old schema:
 * reconciliation decides which of several documents wins a field, and a second document silently
 * overwriting the first's row would make two documents agreeing look identical to two documents
 * that were never compared at all.
 */
export async function saveDocument(
  document: PersistedDocument,
  candidates: FieldCandidate[],
): Promise<RepoOutcome<null>> {
  const db = supabase();
  if (!db) return { ok: false, reason: 'not-configured' };

  const applicant = await ensureApplicant();
  if (!applicant.ok) return { ok: false, reason: applicant.reason };

  // ocr_extractions has no `status` column — it lives inside `fields`, the one place this row has
  // to hold whatever the caller considers this document's read state.
  const { data: extraction, error: extractionError } = await db
    .from('ocr_extractions')
    .insert({
      applicant_id: applicant.applicantId,
      source_type: toSourceType(document.kind),
      fields: { status: document.status },
      confidence: document.confidence ?? null,
      ...(document.readAt ? { processed_at: document.readAt } : {}),
    })
    .select('id')
    .single();
  if (extractionError || !extraction) {
    return { ok: false, reason: extractionError?.message ?? 'Could not save the document.' };
  }

  if (candidates.length === 0) return { ok: true, data: null };

  const { error: fieldError } = await db.from('field_provenance').insert(
    candidates.map((candidate) => ({
      applicant_id: applicant.applicantId,
      field_key: candidate.field,
      value_text: candidate.value,
      source_type: toSourceType(candidate.documentType),
      extraction_id: extraction.id,
      confidence: candidate.confidence,
      extracted_at: new Date(candidate.readAt).toISOString(),
    })),
  );
  if (fieldError) return { ok: false, reason: fieldError.message };

  return { ok: true, data: null };
}

type ExtractionRow = {
  id: string;
  source_type: string;
  fields: { status?: string } | null;
  confidence: number | null;
  processed_at: string | null;
};

type FieldProvenanceRow = {
  field_key: string;
  value_text: string | null;
  source_type: string;
  extraction_id: string | null;
  confidence: number | null;
  extracted_at: string;
};

type ApplicationRow = {
  id: string;
  status: string;
  submitted_at: string | null;
  created_at: string;
  benefit_programs: { code: string } | null;
};

/** Everything this user has on file. */
export async function loadProfile(): Promise<RepoOutcome<PersistedProfile>> {
  const db = supabase();
  if (!db) return { ok: false, reason: 'not-configured' };

  const applicant = await ensureApplicant();
  if (!applicant.ok) return { ok: false, reason: applicant.reason };

  const [extractions, fields, applications] = await Promise.all([
    db.from('ocr_extractions').select('id, source_type, fields, confidence, processed_at'),
    db
      .from('field_provenance')
      .select('field_key, value_text, source_type, extraction_id, confidence, extracted_at'),
    db.from('applications').select('id, status, submitted_at, created_at, benefit_programs(code)'),
  ]);

  const failure = extractions.error ?? fields.error ?? applications.error;
  if (failure) return { ok: false, reason: failure.message };

  return {
    ok: true,
    data: {
      documents: ((extractions.data ?? []) as ExtractionRow[]).map((row) => ({
        id: row.id,
        kind: fromSourceType(row.source_type),
        status: row.fields?.status ?? 'read',
        confidence: row.confidence ?? undefined,
        readAt: row.processed_at ?? undefined,
      })),
      /*
       * Rows written outside the OCR pipeline (USER/SYSTEM/ADMIN/APPLICATION source_type) are
       * filtered out rather than cast — none exist yet since nothing in this file writes them, but
       * a FieldCandidate demands a real DocumentTypeId and inventing one from 'user' or 'system'
       * would be worse than dropping the row.
       */
      candidates: ((fields.data ?? []) as FieldProvenanceRow[])
        .filter((row) => DOCUMENT_SOURCE_TYPES.has(row.source_type))
        .map((row) => ({
          field: row.field_key as ProfileFieldKey,
          value: row.value_text ?? '',
          // Always set by saveDocument for a document-sourced row; the fallback only guards rows
          // this file never itself writes.
          documentId: row.extraction_id ?? '',
          documentType: fromSourceType(row.source_type),
          confidence: row.confidence ?? 0,
          readAt: Date.parse(row.extracted_at) || 0,
        })),
      applications: ((applications.data ?? []) as unknown as ApplicationRow[]).map((row) => ({
        // benefit_programs.code (e.g. "FAIR_FARES"), not the static catalogue's id/programCode
        // (e.g. "P085en"/"S2R085") that the rest of the app currently matches on — see the
        // rewrite report for why this mismatch exists and is not fixed here.
        programId: row.benefit_programs?.code ?? '',
        // No column anywhere in the new schema holds a real external confirmation number yet.
        // Using the application's own id as a placeholder, per explicit decision — not invented
        // silently.
        reference: row.id,
        date: row.submitted_at ?? row.created_at,
        stage: stageForStatus(row.status),
      })),
    },
  };
}

/**
 * Erases everything this user has stored.
 *
 * Deletes the `users` row directly — no RPC, none exists against the new schema. Every table that
 * (transitively) references `applicant_profiles` cascades from it via `ON DELETE CASCADE`
 * (confirmed by reading every migration in `database/schema.sql` and the 3 follow-on files:
 * households, employment_records, income_sources, ocr_extractions, field_provenance, applications
 * -> application_status_history/application_snapshots, screening_person_attributes ->
 * expenses/income_sources.screening_person_id, screening_results, applicant_healthcare,
 * applicant_transportation), and `applicant_profiles` itself cascades from `users`. `audit_logs`
 * is the one table that does not: `entity_id` is a bare UUID with no foreign key, by design for
 * an audit trail, so a record that this user's data once existed can outlive the user without
 * that being an incomplete deletion — it holds no residual profile data itself.
 */
export async function deleteMyData(): Promise<RepoOutcome<null>> {
  const db = supabase();
  if (!db) return { ok: false, reason: 'not-configured' };

  const session = await ensureSession();
  if (!session.ok) return { ok: false, reason: session.detail };

  const { error } = await db.from('users').delete().eq('auth_user_id', session.session.userId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true, data: null };
}
