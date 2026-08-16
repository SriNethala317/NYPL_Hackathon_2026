import type { EligibilityResult, MockUserProfile } from '../eligibility';
import { PROGRAM_FORM_MAPPINGS } from './mappings';
import type { FormFieldPrimitive, FormFillPayload } from './types';

function readProfileValue(profile: MockUserProfile, source: string): FormFieldPrimitive | undefined {
  switch (source) {
    case 'identity.firstName': return profile.identity?.firstName;
    case 'identity.lastName': return profile.identity?.lastName;
    case 'identity.dateOfBirth': return profile.identity?.dateOfBirth;
    case 'contact.email': return profile.contact?.email;
    case 'contact.phone': return profile.contact?.phone;
    case 'residence.street': return profile.residence?.street;
    case 'residence.city': return profile.residence?.city;
    case 'residence.state': return profile.residence?.state;
    case 'residence.zipCode': return profile.residence?.zipCode;
    case 'household.householdSize': return profile.household?.householdSize;
    case 'household.annualIncome': return profile.household?.annualIncome;
    case 'transportation.receivesFullCarfare': return profile.transportation?.receivesFullCarfare;
    case 'transportation.receivesTransportationDiscount': return profile.transportation?.receivesTransportationDiscount;
    case 'healthcare.insuranceEligibility': return profile.healthcare?.insuranceEligibility;
    case 'healthcare.canAffordInsurance': return profile.healthcare?.canAffordInsurance;
    default: return undefined;
  }
}

function isMissing(value: FormFieldPrimitive | undefined): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

export function generateFormPayload(
  profile: MockUserProfile,
  programId: string,
  eligibilityResult: EligibilityResult,
): FormFillPayload {
  if (eligibilityResult.programId !== programId) {
    throw new Error('The eligibility result does not match the selected program.');
  }
  const mapping = PROGRAM_FORM_MAPPINGS[programId];
  if (!mapping) throw new Error(`No form mapping is configured for program: ${programId}`);

  const missingFields = [...eligibilityResult.missingFields];
  const fields = Object.fromEntries(
    Object.entries(mapping.fields).map(([fieldName, source]) => {
      const rawValue = readProfileValue(profile, source);
      const missing = isMissing(rawValue);
      if (missing) missingFields.push(fieldName);
      const value: FormFieldPrimitive = missing ? null : rawValue ?? null;
      return [
        fieldName,
        {
          value,
          source,
          confirmed: !missing && (profile.confirmedFields?.includes(source) ?? false),
        },
      ];
    }),
  );
  const uniqueMissingFields = [...new Set(missingFields)];
  const hasUnconfirmedField = Object.values(fields).some((field) => !field.confirmed);

  return {
    programId,
    applicantId: profile.id,
    eligibilityStatus: eligibilityResult.status,
    fields,
    missingFields: uniqueMissingFields,
    readyForPreview:
      eligibilityResult.status === 'potentially_eligible' && uniqueMissingFields.length === 0 && !hasUnconfirmedField,
  };
}
