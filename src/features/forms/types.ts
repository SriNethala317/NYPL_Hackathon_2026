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

export type FormTemplate = {
  /** Catalogue programme id this form belongs to. */
  programId: string;
  /** Human name of the form itself, e.g. "DRIE Initial Application". */
  formName: string;
  /** Where the blank PDF lives. Verified at fetch time — these links rot. */
  url: string;
  /** Where the completed form goes. */
  submission: {
    kind: 'online-portal' | 'mail' | 'in-person' | 'email';
    /** The portal or instructions page. */
    url?: string;
    address?: string;
    email?: string;
    /** What the applicant actually has to do, in plain language. */
    instructions: string;
  };
  fields: FieldMapping[];
};

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
