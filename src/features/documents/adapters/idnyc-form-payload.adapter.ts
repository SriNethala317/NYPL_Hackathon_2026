import type { FormFieldValue, FormFillPayload } from '../../../../backend/src/features/form-payload';

import type { FillIdNycFormOptions } from '../fill-idnyc-form';
import {
  assertValidIdNycSupplementalInput,
  checkIdNycFormCompletion,
  type FormQuestion,
  type IdNycSupplementalInput,
} from '../idnyc-form-requirements';
import type { Profile } from '../profile';

const REQUIRED_IDNYC_FIELDS = [
  'first_name',
  'last_name',
  'date_of_birth',
  'street_address',
  'city',
  'zip_code',
  'email',
  'phone',
] as const;

export class IdNycFormPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdNycFormPayloadError';
  }
}

export class IdNycFormInputIncompleteError extends IdNycFormPayloadError {
  readonly code = 'FORM_INPUT_INCOMPLETE';

  constructor(readonly questions: FormQuestion[]) {
    super(`IDNYC form input is incomplete: ${questions.map((question) => question.key).join(', ')}.`);
    this.name = 'IdNycFormInputIncompleteError';
  }
}

/**
 * Converts the approved IDNYC semantic payload into the PDF automation input.
 * Eligibility, missing-field collection, and user confirmation remain backend
 * responsibilities; this adapter only enforces their handoff gate.
 */
export function toIdNycAutomationInput(
  payload: FormFillPayload,
  supplementalInput: IdNycSupplementalInput = {},
): { profile: Profile; options: FillIdNycFormOptions } {
  if (payload.programId !== 'idnyc') {
    throw new IdNycFormPayloadError('IDNYC automation requires an idnyc form payload.');
  }
  if (payload.eligibilityStatus !== 'potentially_eligible') {
    throw new IdNycFormPayloadError('IDNYC automation requires a potentially eligible result.');
  }
  if (!payload.readyForPreview) {
    throw new IdNycFormPayloadError('IDNYC automation requires a payload ready for preview.');
  }
  if (payload.missingFields.length > 0) {
    throw new IdNycFormPayloadError('IDNYC automation cannot use a payload with missing fields.');
  }

  assertValidIdNycSupplementalInput(supplementalInput);
  const completion = checkIdNycFormCompletion(payload, supplementalInput);
  if (!completion.complete) {
    throw new IdNycFormInputIncompleteError(completion.requiredQuestions);
  }

  const fields = Object.fromEntries(
    REQUIRED_IDNYC_FIELDS.map((fieldName) => [fieldName, requireConfirmedText(payload.fields[fieldName], fieldName)]),
  ) as Record<(typeof REQUIRED_IDNYC_FIELDS)[number], string>;

  return {
    profile: {
      name: { first: fields.first_name, middle: supplementalInput.middleName, last: fields.last_name },
      dateOfBirth: fields.date_of_birth,
      address: {
        street: fields.street_address,
        unit: supplementalInput.apartmentUnit,
        city: fields.city,
        zip: fields.zip_code,
        borough: supplementalInput.borough,
      },
      eyeColor: supplementalInput.eyeColor,
      heightInches: supplementalInput.heightFeet! * 12 + supplementalInput.heightInches!,
      gender: supplementalInput.gender,
      email: fields.email,
      phone: fields.phone,
      languagePreference: supplementalInput.languagePreference,
      isVeteran: supplementalInput.veteranDesignation,
      organDonorOptIn: supplementalInput.organDonor,
      emergencyContact: supplementalInput.emergencyContact?.name && supplementalInput.emergencyContact.phone
        ? { name: supplementalInput.emergencyContact.name, phone: supplementalInput.emergencyContact.phone }
        : undefined,
    },
    options: { applicationType: supplementalInput.applicationType },
  };
}

function requireConfirmedText(field: FormFieldValue | undefined, fieldName: string): string {
  if (!field) {
    throw new IdNycFormPayloadError(`IDNYC payload is missing required field: ${fieldName}.`);
  }
  if (!field.confirmed) {
    throw new IdNycFormPayloadError(`IDNYC payload field is not confirmed: ${fieldName}.`);
  }
  if (typeof field.value !== 'string' || field.value.trim() === '') {
    throw new IdNycFormPayloadError(`IDNYC payload field must contain confirmed text: ${fieldName}.`);
  }
  return field.value;
}
