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
}

export interface ProgramFormMapping {
  programId: string;
  fields: Record<string, string>;
}
