import { documentType, type DocumentTypeId } from './document-types';
import type { FieldCandidate } from './reconcile';

/**
 * The demo applicant, and what each document would yield.
 *
 * `extractionFor` stands in for the Edge Function's structured-output response: a list of
 * candidate values with per-field confidence and provenance. Reconciliation then decides which
 * of them wins — the same code path the real pipeline will use.
 */

/**
 * The demo applicant, overridable from `.env` so nobody's real details land in git.
 *
 * The committed default is an invented person. Demoing as yourself means putting a real name,
 * address and date of birth somewhere — and a fixture outlives the demo, so hard-coding it here
 * writes it into the repository's history permanently, including any fork or public mirror.
 * Reading it from a gitignored `.env` keeps the convenience and drops the exposure.
 *
 * Set `EXPO_PUBLIC_DEMO_*` in `.env` (see `.env.example`). Absent, the invented default is used.
 *
 * One thing worth knowing whichever you choose: nearly every programme in the catalogue checks
 * NYC residency, so an out-of-state address screens as ineligible almost everywhere. That is the
 * eligibility engine being right, and it looks like a broken app.
 */
/*
 * Every read below is written out in full on purpose.
 *
 * Expo replaces `process.env.EXPO_PUBLIC_X` with a literal at bundle time by scanning the source
 * for that exact text. A computed key — `process.env[`EXPO_PUBLIC_DEMO_${name}`]` — is never
 * matched, so it survives into the bundle as a lookup on an object that does not exist at runtime
 * and quietly evaluates to undefined. Every value would fall back to the invented applicant, on
 * device only, with the tests still passing.
 */
const CONFIGURED = {
  NAME: process.env.EXPO_PUBLIC_DEMO_NAME,
  DOB: process.env.EXPO_PUBLIC_DEMO_DOB,
  ADDRESS: process.env.EXPO_PUBLIC_DEMO_ADDRESS,
  HOUSEHOLD: process.env.EXPO_PUBLIC_DEMO_HOUSEHOLD,
  INCOME: process.env.EXPO_PUBLIC_DEMO_INCOME,
  SEX: process.env.EXPO_PUBLIC_DEMO_SEX,
  HEIGHT_FEET: process.env.EXPO_PUBLIC_DEMO_HEIGHT_FEET,
  HEIGHT_INCHES: process.env.EXPO_PUBLIC_DEMO_HEIGHT_INCHES,
  EYES: process.env.EXPO_PUBLIC_DEMO_EYES,
  LICENCE_CLASS: process.env.EXPO_PUBLIC_DEMO_LICENCE_CLASS,
  ISSUED: process.env.EXPO_PUBLIC_DEMO_ISSUED,
  EXPIRES: process.env.EXPO_PUBLIC_DEMO_EXPIRES,
} as const;

function fromEnv(name: keyof typeof CONFIGURED, fallback: string): string {
  const value = CONFIGURED[name];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

/** First letter of the first and last word — "Ana Maria Ruiz" → "AR". */
function initialsOf(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : '';
  return (first + last).toUpperCase();
}

const demoName = fromEnv('NAME', 'Maria Reyes');

export const sampleProfile = {
  fullName: demoName,
  initials: initialsOf(demoName),
  dob: fromEnv('DOB', '04/18/1991'),
  address: fromEnv('ADDRESS', '1240 Grand Concourse, Bronx, NY 10456'),
  household: fromEnv('HOUSEHOLD', '3'),
  /** Monthly, as the form asks for it. */
  income: fromEnv('INCOME', '2310'),
} as const;

/**
 * The rest of what a driver's licence prints.
 *
 * None of it is extracted or stored by the app — the profile holds five fields, and height, eye
 * colour and organ-donor status are not among them. It exists so a demo licence is a complete
 * document, and so the IDNYC form's height and eye-colour boxes have something to point at when
 * showing what the applicant still has to add by hand.
 */
export const sampleLicence = {
  sex: fromEnv('SEX', 'F'),
  heightFeet: fromEnv('HEIGHT_FEET', '5'),
  heightInches: fromEnv('HEIGHT_INCHES', '04'),
  eyeColour: fromEnv('EYES', 'BRO'),
  licenceClass: fromEnv('LICENCE_CLASS', 'D'),
  issued: fromEnv('ISSUED', '08/10/2024'),
  expires: fromEnv('EXPIRES', '08/10/2032'),
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
