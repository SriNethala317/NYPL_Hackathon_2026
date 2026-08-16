import { extractFields } from './field-matchers';
import { ocrProvider } from './ocr-provider';
import type { PickedDocument } from './pick-document';

import { documentTypes, type DocumentTypeId } from '@/data/document-types';
import type { FieldCandidate } from '@/data/reconcile';

/**
 * The whole read: image in, field candidates out.
 *
 * This is the seam the app calls. Everything either side of it is already built and tested —
 * picking a document, matching labels, reconciling values across documents — and this is the
 * piece that connects them.
 *
 * Classification is by keyword, not by model. It is weak, and it says so: below a threshold it
 * returns `unknown` and the user picks the type, because guessing a document type propagates a
 * wrong type into every field read from it.
 */

export type ReadOutcome =
  | {
      ok: true;
      documentType: DocumentTypeId;
      /** 0–1. Low values route through user confirmation rather than being trusted. */
      confidence: number;
      candidates: FieldCandidate[];
      /** The raw text, kept only in memory for this call so the UI can show what was read. */
      text: string;
    }
  | { ok: false; reason: 'unreadable' | 'unavailable' | 'no-type'; detail: string; text?: string };

/**
 * Phrases that identify a document type, most specific first.
 *
 * Ordering matters: a W-2 mentions "wages" and so does a pay stub, but only a W-2 says "W-2".
 */
const SIGNATURES: { type: DocumentTypeId; patterns: RegExp[] }[] = [
  { type: 'w2', patterns: [/\bw-?2\b/i, /wage and tax statement/i] },
  { type: 'tax_return', patterns: [/\bform\s*1040\b/i, /u\.?s\.? individual income tax return/i] },
  { type: 'i20', patterns: [/\bi-?20\b/i, /certificate of eligibility.*student status/i, /\bsevis\b/i] },
  { type: 'passport', patterns: [/\bpassport\b/i] },
  { type: 'permanent_resident_card', patterns: [/permanent resident card/i, /green card/i] },
  { type: 'idnyc', patterns: [/\bidnyc\b/i] },
  { type: 'drivers_license', patterns: [/driver'?s? licen[cs]e/i] },
  { type: 'state_id', patterns: [/identification card/i, /\bnon-?driver\b/i] },
  { type: 'pay_stub', patterns: [/earnings statement/i, /gross pay/i, /pay period/i] },
  { type: 'bank_statement', patterns: [/account statement/i, /available balance/i] },
  { type: 'lease', patterns: [/\blease agreement\b/i, /\blandlord\b/i, /\btenant\b/i] },
  { type: 'utility_bill', patterns: [/con edison/i, /national grid/i, /amount due/i, /service address/i] },
  { type: 'benefits_letter', patterns: [/notice of decision/i, /benefit award/i] },
];

/** Best-guess document type from the text, with a confidence that reflects how thin the guess is. */
export function classify(text: string): { type: DocumentTypeId; confidence: number } {
  const hits = SIGNATURES.map((signature) => ({
    type: signature.type,
    matches: signature.patterns.filter((pattern) => pattern.test(text)).length,
  })).filter((hit) => hit.matches > 0);

  if (hits.length === 0) return { type: 'unknown', confidence: 0 };

  hits.sort((a, b) => b.matches - a.matches);
  const best = hits[0];
  const contested = hits.filter((hit) => hit.matches === best.matches).length > 1;

  /*
   * Calibrated so a single keyword lands *below* the floor.
   *
   * "Amount due" appears on a utility bill and on half the letters an agency sends. One match
   * scoring above the threshold meant the classifier named a document on the strength of one
   * common phrase; two independent signatures agreeing is the point where it is worth trusting.
   * A tie between types is thin regardless — picking one at random is how a lease becomes a pay
   * stub, and every field then gets read off the wrong template.
   */
  const confidence = contested ? 0.4 : Math.min(0.35 + best.matches * 0.2, 0.95);
  return { type: best.type, confidence };
}

/** Below this the classifier declines to name the document and the user picks. */
const TYPE_CONFIDENCE_FLOOR = 0.6;

export type ReadOptions = {
  /** Set when the user has already told us what this is; skips classification. */
  as?: DocumentTypeId;
  /** Ordering key for reconciliation tie-breaks. */
  readAt?: number;
  documentId: string;
};

export async function readDocument(
  document: PickedDocument,
  options: ReadOptions,
): Promise<ReadOutcome> {
  const provider = ocrProvider();

  if (!provider.isAvailable()) {
    return {
      ok: false,
      reason: 'unavailable',
      detail: 'Reading documents automatically is not available in this build.',
    };
  }

  const read = await provider.read(document.uri);
  if (!read.ok) {
    return { ok: false, reason: 'unreadable', detail: read.detail };
  }

  const text = read.text;
  const classified = options.as
    ? { type: options.as, confidence: 1 }
    : classify(text);

  if (classified.type === 'unknown' || classified.confidence < TYPE_CONFIDENCE_FLOOR) {
    // Hand back the text so a user-chosen type can be applied without re-reading the image.
    return {
      ok: false,
      reason: 'no-type',
      detail: 'We could not tell what this document is.',
      text,
    };
  }

  const fields = extractFields(text, classified.type);
  const candidates: FieldCandidate[] = fields
    // `employer` is captured for matching a pay stub to a W-2 later; it is not a profile field.
    .filter((field) => PROFILE_KEYS.has(field.key))
    .map((field) => ({
      field: field.key as FieldCandidate['field'],
      value: field.value,
      documentId: options.documentId,
      documentType: classified.type,
      // Field confidence is bounded by how well the page was read overall.
      confidence: Math.min(field.confidence, read.confidence || 1),
      readAt: options.readAt ?? Date.now(),
    }));

  return { ok: true, documentType: classified.type, confidence: classified.confidence, candidates, text };
}

const PROFILE_KEYS = new Set(['fullName', 'dob', 'address', 'household', 'income']);

/** Document types a user can pick from when classification declines. */
export const selectableTypes = documentTypes.filter((type) => type.id !== 'unknown');
