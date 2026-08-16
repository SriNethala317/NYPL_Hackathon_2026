import type { ProfileFieldKey } from './profile-fields';

import type { DocumentKind } from '@/theme';

/**
 * The demo applicant from the design handoff.
 *
 * Stands in for what the OCR → LLM pipeline would return. `readOn` is the date the document was
 * read; under extract-then-discard there is no stored file to name afterwards, so this is what
 * the Profile row shows instead of a filename.
 */

export type ExtractedValues = Record<ProfileFieldKey, string>;

export const sampleProfile = {
  fullName: 'Maria Reyes',
  initials: 'MR',
  values: {
    fullName: 'Maria Reyes',
    dob: '04/18/1991',
    address: '1240 Grand Concourse, Bronx, NY 10456',
    household: '3',
    income: '2310',
  } satisfies ExtractedValues,
} as const;

/** Which documents the "Preview with sample documents" affordance puts on file. */
export const sampleDocuments: readonly DocumentKind[] = [
  'id',
  'address',
  'income',
  'lease',
  'utility',
] as const;

export const sampleReadDate = 'Aug 16, 2026';

/** One pre-existing application, so Home has something to show in the demo. */
export const sampleApplication = {
  programId: 'snap',
  reference: 'NYC-2026-4180',
  date: 'Aug 11, 2026',
  stage: 1,
} as const;
