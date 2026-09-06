import type { EligibilityStatus } from '../eligibility';

export type FormFieldPrimitive = string | number | boolean | null;

export interface FormFieldValue {
  value: FormFieldPrimitive;
  source: string;
  confirmed: boolean;
}

export interface FormFillPayload {
  programId: string;
  applicantId: string;
  eligibilityStatus: EligibilityStatus;
  fields: Record<string, FormFieldValue>;
  missingFields: string[];
  readyForPreview: boolean;
  /**
   * `'program_specific'` — a real mapping hand-verified against that program's actual application
   * form (currently Fair Fares, IDNYC, NYC Care only). `'generic_fields'` — the 9-field identity/
   * residence/contact fallback (`config/generic.mapping.ts`), used for every other program. Not
   * verified against any of those programs' real forms — a reasonable default, not a claim of
   * per-program accuracy. The frontend must not present these two the same way.
   */
  mappingSource: 'program_specific' | 'generic_fields';
}

export interface ProgramFormMapping {
  programId: string;
  fields: Record<string, string>;
}
