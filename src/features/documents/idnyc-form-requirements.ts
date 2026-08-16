import type { IdNycApplicationType } from './fill-idnyc-form';
import type { Borough, EyeColor, Gender } from './profile';
import type { FormFillPayload } from '../../../backend/src/features/form-payload';

export type FormQuestionType = 'text' | 'date' | 'boolean' | 'select' | 'number';

export interface FormQuestion {
  key: string;
  canonicalPath?: string;
  label: string;
  description?: string;
  type: FormQuestionType;
  required: boolean;
  conditional?: { dependsOn: string; equals: unknown };
  options?: { value: string; label: string }[];
  source: 'canonical_profile' | 'form_specific';
  pii: 'none' | 'personal' | 'sensitive';
  reason: string;
}

/** Values needed only to complete an IDNYC PDF; they are not benefits-profile fields. */
export interface IdNycSupplementalInput {
  applicationType?: IdNycApplicationType;
  middleName?: string;
  apartmentUnit?: string;
  borough?: Borough;
  eyeColor?: EyeColor;
  heightFeet?: number;
  heightInches?: number;
  gender?: Gender;
  languagePreference?: string;
  veteranDesignation?: boolean;
  organDonor?: boolean;
  emergencyContact?: { name?: string; phone?: string };
}

export interface FormCompletionCheck {
  complete: boolean;
  requiredQuestions: FormQuestion[];
  optionalQuestions: FormQuestion[];
  manualFields: FormQuestion[];
  unsupportedFields: FormQuestion[];
}

const selectOptions = <T extends readonly string[]>(values: T) =>
  values.map((value) => ({ value, label: value.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase()) }));

const applicationTypes = ['new', 'reapplication', 'renewal', 'updateCard', 'replaceCard'] as const;
const eyeColors = ['brown', 'hazel', 'black', 'blue', 'green', 'gray', 'multiColor'] as const;
const genders = ['female', 'male', 'notDesignated'] as const;
const boroughs = ['bronx', 'brooklyn', 'manhattan', 'queens', 'statenIsland'] as const;

/**
 * User-facing requirements for AcroForm fields that are not supplied through
 * the existing IDNYC FormFillPayload. The base payload still owns the
 * confirmed identity, contact, and address values it already maps.
 */
export const IDNYC_FORM_REQUIREMENTS: readonly FormQuestion[] = [
  {
    key: 'application_type', label: 'What type of IDNYC application is this?', type: 'select', required: true,
    options: selectOptions(applicationTypes), source: 'form_specific', pii: 'none',
    reason: 'The PDF requires one application-type checkbox; the automation never guesses one.',
  },
  {
    key: 'eye_color', label: 'What is your eye color?', type: 'select', required: true,
    options: selectOptions(eyeColors), source: 'form_specific', pii: 'personal',
    reason: 'The IDNYC PDF has an eye-color selection field.',
  },
  {
    key: 'height_feet', label: 'What is your height (feet)?', type: 'number', required: true,
    source: 'form_specific', pii: 'personal', reason: 'The IDNYC PDF has a height-feet field.',
  },
  {
    key: 'height_inches', label: 'What is your height (additional inches)?', type: 'number', required: true,
    source: 'form_specific', pii: 'personal', reason: 'The IDNYC PDF has a height-inches field.',
  },
  {
    key: 'gender', label: 'What gender should appear on the form?', type: 'select', required: true,
    options: selectOptions(genders), source: 'form_specific', pii: 'sensitive',
    reason: 'The IDNYC PDF has a gender selection field.',
  },
  {
    key: 'borough', label: 'Which borough is your residence in?', type: 'select', required: true,
    options: selectOptions(boroughs), source: 'form_specific', pii: 'personal',
    reason: 'The PDF has a borough selection field; the current form payload does not carry this value.',
  },
  {
    key: 'middle_name', label: 'Middle name or initial', type: 'text', required: false,
    source: 'form_specific', pii: 'personal', reason: 'The PDF provides a middle-name field, but it is optional.',
  },
  {
    key: 'apartment_unit', label: 'Apartment, floor, suite, unit, or room', type: 'text', required: false,
    source: 'form_specific', pii: 'personal', reason: 'The PDF provides an optional address-unit field.',
  },
  {
    key: 'language_preference', label: 'Preferred language', type: 'text', required: false,
    source: 'form_specific', pii: 'personal', reason: 'The PDF provides a preferred-language field.',
  },
  {
    key: 'veteran_designation', label: 'Would you like a veteran designation?', type: 'boolean', required: false,
    source: 'form_specific', pii: 'sensitive', reason: 'The PDF has an optional veteran-designation checkbox.',
  },
  {
    key: 'organ_donor', label: 'Would you like to join the Donate Life Registry?', type: 'boolean', required: false,
    source: 'form_specific', pii: 'sensitive', reason: 'The PDF has an optional organ-donor checkbox.',
  },
  {
    key: 'emergency_contact_name', label: 'Emergency contact name', type: 'text', required: false,
    source: 'form_specific', pii: 'personal', reason: 'Emergency contact is optional on the IDNYC PDF.',
  },
  {
    key: 'emergency_contact_phone', label: 'Emergency contact phone', type: 'text', required: false,
    source: 'form_specific', pii: 'personal', reason: 'Emergency contact is optional on the IDNYC PDF.',
  },
  {
    key: 'idnyc_number', label: 'Existing IDNYC number', type: 'text', required: false,
    conditional: { dependsOn: 'application_type', equals: 'renewal' }, source: 'form_specific', pii: 'personal',
    reason: 'Renewals use this PDF field, but the current filler does not populate it.',
  },
];

const MANUAL_FIELDS: readonly FormQuestion[] = [
  {
    key: 'applicant_signature', label: 'Applicant signature', type: 'text', required: false,
    source: 'form_specific', pii: 'personal', reason: 'Sign manually after reviewing the generated PDF; no signature is generated by automation.',
  },
  {
    key: 'application_date', label: 'Application date', type: 'date', required: false,
    source: 'form_specific', pii: 'personal', reason: 'Enter or confirm manually with the signature; automation does not date the application.',
  },
  {
    key: 'organ_donor_signature', label: 'Organ donor signature', type: 'text', required: false,
    conditional: { dependsOn: 'organ_donor', equals: true }, source: 'form_specific', pii: 'sensitive',
    reason: 'A donor election requires explicit manual signature; automation never signs.',
  },
];

const UNSUPPORTED_FIELDS: readonly FormQuestion[] = IDNYC_FORM_REQUIREMENTS.filter((question) => question.key === 'idnyc_number');

export function getIdNycMissingFormQuestions(
  _payload: FormFillPayload,
  supplemental: IdNycSupplementalInput = {},
): FormQuestion[] {
  assertValidIdNycSupplementalInput(supplemental);
  return IDNYC_FORM_REQUIREMENTS.filter((question) => {
    if (question.key === 'idnyc_number') return false;
    return !hasSupplementalValue(question.key, supplemental);
  });
}

export function checkIdNycFormCompletion(
  payload: FormFillPayload,
  supplemental: IdNycSupplementalInput = {},
): FormCompletionCheck {
  const unresolved = getIdNycMissingFormQuestions(payload, supplemental);
  return {
    complete: unresolved.every((question) => !question.required),
    requiredQuestions: unresolved.filter((question) => question.required),
    optionalQuestions: unresolved.filter((question) => !question.required),
    manualFields: MANUAL_FIELDS.filter((question) => conditionApplies(question, supplemental)),
    unsupportedFields: UNSUPPORTED_FIELDS.filter((question) => conditionApplies(question, supplemental)),
  };
}

export function assertValidIdNycSupplementalInput(input: IdNycSupplementalInput): void {
  assertOneOf('applicationType', input.applicationType, applicationTypes);
  assertOneOf('eyeColor', input.eyeColor, eyeColors);
  assertOneOf('gender', input.gender, genders);
  assertOneOf('borough', input.borough, boroughs);
  if (input.heightFeet !== undefined && (!Number.isInteger(input.heightFeet) || input.heightFeet < 0 || input.heightFeet > 9)) {
    throw new Error('Invalid IDNYC supplemental value: heightFeet must be a whole number from 0 to 9.');
  }
  if (input.heightInches !== undefined && (!Number.isInteger(input.heightInches) || input.heightInches < 0 || input.heightInches > 11)) {
    throw new Error('Invalid IDNYC supplemental value: heightInches must be a whole number from 0 to 11.');
  }
  if (input.emergencyContact && (input.emergencyContact.name === undefined) !== (input.emergencyContact.phone === undefined)) {
    throw new Error('IDNYC emergency contact requires both name and phone when provided.');
  }
}

function assertOneOf(name: string, value: string | undefined, values: readonly string[]): void {
  if (value !== undefined && !values.includes(value)) {
    throw new Error(`Invalid IDNYC supplemental value: ${name}.`);
  }
}

function conditionApplies(question: FormQuestion, supplemental: IdNycSupplementalInput): boolean {
  if (!question.conditional) return true;
  return getSupplementalValue(question.conditional.dependsOn, supplemental) === question.conditional.equals;
}

function hasSupplementalValue(key: string, supplemental: IdNycSupplementalInput): boolean {
  return getSupplementalValue(key, supplemental) !== undefined;
}

function getSupplementalValue(key: string, supplemental: IdNycSupplementalInput): unknown {
  const values: Record<string, unknown> = {
    application_type: supplemental.applicationType,
    middle_name: supplemental.middleName,
    apartment_unit: supplemental.apartmentUnit,
    borough: supplemental.borough,
    eye_color: supplemental.eyeColor,
    height_feet: supplemental.heightFeet,
    height_inches: supplemental.heightInches,
    gender: supplemental.gender,
    language_preference: supplemental.languagePreference,
    veteran_designation: supplemental.veteranDesignation,
    organ_donor: supplemental.organDonor,
    emergency_contact_name: supplemental.emergencyContact?.name,
    emergency_contact_phone: supplemental.emergencyContact?.phone,
  };
  return values[key];
}
