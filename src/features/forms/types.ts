import type { ProfileFieldKey } from '@/data/profile-fields';

/**
 * Describing a government PDF well enough to fill it.
 *
 * Field names come from `node scripts/inspect-form.mjs <url>`, never from guesswork — a mapping
 * written against an imagined field name produces a PDF that looks filled and silently is not,
 * which is worse than not filling it at all.
 */

/** Where a form field's value comes from. */
export type FieldSource =
  /** Straight from the profile. */
  | { from: 'profile'; key: ProfileFieldKey }
  /** A component of the parsed address. */
  | { from: 'address'; part: 'street' | 'apt' | 'city' | 'state' | 'zip' }
  /** Today's date, for signature blocks. */
  | { from: 'today' }
  /** A fixed value, e.g. a state that is always NY. */
  | { from: 'constant'; value: string }
  /**
   * Deliberately left blank for the applicant to complete by hand.
   *
   * Used for anything we refuse to hold — an SSN box on a form is not a reason to start storing
   * SSNs. `reason` is shown to the user so a gap never looks like a bug.
   */
  | { from: 'manual'; reason: string };

export type FieldMapping = {
  /** The PDF's own field name, exactly as `inspect-form` reports it. */
  pdfField: string;
  source: FieldSource;
  /** A date reformatted for this form, if it wants something other than MM/DD/YYYY. */
  format?: 'mmddyyyy' | 'digits';
};

/**
 * One way a completed form can actually reach the agency.
 *
 * Modelled as a list rather than a single value because the real programmes accept several, and
 * which one is *best* depends on the applicant, not on us. Research into the City's own published
 * instructions found SNAP and HEAP both take a printed application by mail or fax with no online
 * account at all — and Emergency HEAP has no online option whatsoever, so for that programme paper
 * is the primary channel rather than the fallback.
 *
 * That matters for who this app is for. Requiring a portal login excludes people without an email
 * address, without a smartphone they control, or who have been locked out of an account they made
 * years ago — which is a good part of the population most in need of the benefit.
 */
export type SubmissionChannel =
  /** The agency's own web portal. The applicant signs in themselves; we never touch credentials. */
  | { kind: 'online-portal'; url: string; instructions: string }
  /** Post it. Slowest, but needs no account and no internet. */
  | { kind: 'mail'; address: string; instructions: string }
  /** Fax, still the fastest no-account route for several NYC programmes. */
  | { kind: 'fax'; fax: string; instructions: string }
  /** Hand it in. `findUrl` points at the office locator. */
  | { kind: 'in-person'; findUrl?: string; instructions: string }
  | { kind: 'email'; email: string; instructions: string }
  /**
   * A community organisation files it with the applicant.
   *
   * Not automation — a caseworker sitting with them. For anyone unsure about immigration
   * consequences this is the right answer and the app should say so rather than compete with it.
   */
  | { kind: 'cbo'; url: string; instructions: string };

export type FormTemplate = {
  /** Catalogue programme id this form belongs to. */
  programId: string;
  /** Human name of the form itself, e.g. "DRIE Initial Application". */
  formName: string;
  /** The agency's own designation, e.g. "LDSS-4826". Empty when the form carries no number. */
  formNumber?: string;
  /** Where the blank PDF lives. Verified at fetch time — these links rot. */
  url: string;
  /**
   * Every accepted route, best-first.
   *
   * "Best" means most likely to succeed for someone with no account and no printer — not most
   * convenient for us to implement.
   */
  channels: SubmissionChannel[];
  /** True when the form must be signed by hand before it is valid. */
  requiresSignature?: boolean;
  fields: FieldMapping[];
};

/** The route to lead with. */
export function primaryChannel(template: FormTemplate): SubmissionChannel | undefined {
  return template.channels[0];
}

/** One field's outcome, so the UI can show what was filled and what was left. */
export type FilledField = {
  pdfField: string;
  value?: string;
  status: 'filled' | 'manual' | 'missing' | 'unknown-field';
  /** Why it was left blank, for `manual` and `missing`. */
  note?: string;
};

export type FillResult = {
  /** The completed PDF. */
  bytes: Uint8Array;
  fields: FilledField[];
  filledCount: number;
  /** Fields the applicant must complete by hand before submitting. */
  manualCount: number;
  /** Fields we had no data for. */
  missingCount: number;
};
