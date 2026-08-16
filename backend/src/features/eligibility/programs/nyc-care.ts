import { PROGRAM_SOURCES } from '../sources';
import type { EligibilityInput, EligibilityResult, ProgramValidator } from '../types';

export const nycCareValidator: ProgramValidator = {
  programId: 'nyc_care',
  programName: 'NYC Care',
  validate(input: EligibilityInput): EligibilityResult {
    const reasons: string[] = [];
    const missingFields: string[] = [];
    if (input.nycResident === false) reasons.push('NYC Care is available to New York City residents.');
    else if (input.nycResident === undefined) missingFields.push('nycResident');

    // NYC Care requires a formal insurance and affordability screening. This engine never infers it from income.
    if (input.insuranceEligibility === undefined || input.insuranceEligibility === 'unknown') {
      missingFields.push('insuranceEligibility');
    } else if (input.insuranceEligibility === 'eligible') {
      reasons.push('Applicant is eligible for a New York State health insurance plan.');
    }
    if (input.canAffordInsurance === undefined) missingFields.push('canAffordInsurance');
    else if (input.canAffordInsurance) reasons.push('Applicant can afford available health insurance based on their screening.');

    return {
      programId: 'nyc_care',
      programName: 'NYC Care',
      status: reasons.length > 0 ? 'likely_not_eligible' : missingFields.length > 0 ? 'needs_more_information' : 'potentially_eligible',
      reasons,
      missingFields,
      source: PROGRAM_SOURCES.nyc_care,
    };
  },
};
