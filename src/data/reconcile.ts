import { authorityRank, type DocumentTypeId } from './document-types';
import { fieldDef, type ProfileFieldKey } from './profile-fields';

/**
 * Merging field values that came from different documents.
 *
 * This is the step most likely to put a wrong value on a government form, so the rules are
 * explicit rather than emergent:
 *
 *   1. The more authoritative document wins (see `fieldAuthority`).
 *   2. At equal authority, the more recent document wins.
 *   3. At equal authority and recency, higher extraction confidence wins.
 *   4. For fields that should not drift — legal name, date of birth — an equally authoritative
 *      disagreement is *not* resolved. It is surfaced and the user decides.
 *
 * Rule 4 is the important one. A passport reading "Maria Reyes" and a W-2 reading
 * "Maria R. Reyes" is resolved by precedence and never bothers anyone. Two identity documents
 * disagreeing means an OCR error or a different person, and silently picking either is how the
 * wrong name reaches an application.
 */

export type FieldCandidate = {
  field: ProfileFieldKey;
  value: string;
  documentId: string;
  documentType: DocumentTypeId;
  /** 0–1, as reported per field by the extractor. */
  confidence: number;
  /** When the document was read; used to break authority ties. */
  readAt: number;
};

export type ResolvedField = {
  field: ProfileFieldKey;
  value: string;
  documentId: string;
  documentType: DocumentTypeId;
  confidence: number;
  /** Equally authoritative candidates that disagree. Non-empty means: ask the user. */
  conflicts: FieldCandidate[];
};

/** Comparison form only — never displayed, never stored. */
function normalize(field: ProfileFieldKey, value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (field === 'income' || field === 'household') {
    // "$2,310" and "2310" are the same answer.
    const digits = trimmed.replace(/[^0-9.]/g, '');
    return digits === '' ? '' : String(Number(digits));
  }
  return trimmed.toLowerCase();
}

function better(a: FieldCandidate, b: FieldCandidate): number {
  const rank = authorityRank(a.field, a.documentType) - authorityRank(b.field, b.documentType);
  if (rank !== 0) return rank;
  if (a.readAt !== b.readAt) return b.readAt - a.readAt;
  return b.confidence - a.confidence;
}

/**
 * Picks the winning value for one field, and reports any disagreement worth asking about.
 * Returns `null` when no document can speak to the field at all.
 */
export function resolveField(
  field: ProfileFieldKey,
  candidates: readonly FieldCandidate[],
): ResolvedField | null {
  const usable = candidates.filter(
    (c) =>
      c.field === field &&
      normalize(field, c.value) !== '' &&
      // A document that cannot speak to this field must not win it by being recent.
      authorityRank(field, c.documentType) !== Infinity,
  );
  if (usable.length === 0) return null;

  const [winner, ...rest] = [...usable].sort(better);
  const winnerRank = authorityRank(field, winner.documentType);
  const winnerValue = normalize(field, winner.value);

  // Time-varying fields are *meant* to change, so a newer document supersedes rather than
  // conflicts. Only stable fields escalate a disagreement to the user.
  const conflicts = fieldDef(field).timeVarying
    ? []
    : rest.filter(
        (c) =>
          authorityRank(field, c.documentType) === winnerRank &&
          normalize(field, c.value) !== winnerValue,
      );

  return {
    field,
    value: winner.value,
    documentId: winner.documentId,
    documentType: winner.documentType,
    confidence: winner.confidence,
    conflicts,
  };
}

/** Resolves every field that has at least one candidate. */
export function reconcile(candidates: readonly FieldCandidate[]): ResolvedField[] {
  const fields = [...new Set(candidates.map((c) => c.field))];
  return fields
    .map((field) => resolveField(field, candidates))
    .filter((r): r is ResolvedField => r !== null);
}

/** Fields needing a human decision before they can be certified. */
export function unresolved(resolved: readonly ResolvedField[]): ResolvedField[] {
  return resolved.filter((r) => r.conflicts.length > 0);
}
