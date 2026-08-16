import { documentType, type DocumentTypeId } from './document-types';
import type { FieldCandidate } from './reconcile';

/**
 * The demo applicant, and what each document would yield.
 *
 * `extractionFor` stands in for the Edge Function's structured-output response: a list of
 * candidate values with per-field confidence and provenance. Reconciliation then decides which
 * of them wins — the same code path the real pipeline will use.
 */

export const sampleProfile = {
  fullName: 'Maria Reyes',
  initials: 'MR',
  dob: '04/18/1991',
  address: '1240 Grand Concourse, Bronx, NY 10456',
  household: '3',
  /** Monthly, as the form asks for it. */
  income: '2310',
} as const;

/** What "Preview with sample documents" puts on file — an ID plus proof of income and address. */
export const sampleUploads: readonly { type: DocumentTypeId }[] = [
  { type: 'passport' },
  { type: 'w2' },
  { type: 'utility_bill' },
  { type: 'lease' },
] as const;

/** One pre-existing application, so Home has something to show. */
export const sampleApplication = {
  programId: 'snap',
  reference: 'NYC-2026-4180',
  date: 'Aug 11, 2026',
  stage: 1,
} as const;

/**
 * The values a given document type yields for the sample applicant.
 *
 * Only fields the document type actually declares are returned, so a passport never invents an
 * income and a lease never invents a name.
 */
export function extractionFor(
  type: DocumentTypeId,
  documentId: string,
  readAt: number,
): FieldCandidate[] {
  const values: Partial<Record<string, string>> = {
    fullName: sampleProfile.fullName,
    dob: sampleProfile.dob,
    address: sampleProfile.address,
    household: sampleProfile.household,
    income: sampleProfile.income,
  };

  return documentType(type)
    .yields.filter((field) => values[field])
    .map((field) => ({
      field,
      value: values[field] as string,
      documentId,
      documentType: type,
      // Real extraction reports this per field; a clear line on a blurry page is still reliable.
      confidence: 0.94,
      readAt,
    }));
}
