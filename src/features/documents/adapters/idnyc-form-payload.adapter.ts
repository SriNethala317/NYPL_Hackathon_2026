import type { FormFieldValue, FormFillPayload } from '../../../../backend/src/features/form-payload';

import type { FillIdNycFormOptions } from '../fill-idnyc-form';
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

/**
 * Converts the approved IDNYC semantic payload into the PDF automation input.
 * Eligibility, missing-field collection, and user confirmation remain backend
 * responsibilities; this adapter only enforces their handoff gate.
 */
export function toIdNycAutomationInput(
  payload: FormFillPayload,
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

  const fields = Object.fromEntries(
    REQUIRED_IDNYC_FIELDS.map((fieldName) => [fieldName, requireConfirmedText(payload.fields[fieldName], fieldName)]),
  ) as Record<(typeof REQUIRED_IDNYC_FIELDS)[number], string>;

  return {
    profile: {
      name: { first: fields.first_name, last: fields.last_name },
      dateOfBirth: fields.date_of_birth,
      address: {
        street: fields.street_address,
        city: fields.city,
        zip: fields.zip_code,
      },
      email: fields.email,
      phone: fields.phone,
    },
    // Leave application type unspecified so the existing filler applies its
    // documented "new" default rather than the adapter inventing a value.
    options: {},
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
