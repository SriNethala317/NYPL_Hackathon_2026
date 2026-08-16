import { normalizeProfileForEligibility, type MockUserProfile } from '../eligibility';
import type { BenefitsScreeningInput } from './types';

/** Privacy boundary for all benefits-screening providers: direct identifiers never cross it. */
export function toBenefitsScreeningInput(profile: MockUserProfile): BenefitsScreeningInput {
  const eligibility = normalizeProfileForEligibility(profile);
  return {
    age: eligibility.age,
    nycResident: eligibility.nycResident,
    householdSize: eligibility.householdSize,
    annualIncome: eligibility.annualIncome,
    employmentStatus: profile.benefits?.employmentStatus,
    studentStatus: profile.benefits?.studentStatus,
    hasInsurance: eligibility.hasInsurance,
    insuranceEligibility: eligibility.insuranceEligibility,
    receivesTransportationDiscount: eligibility.receivesTransportationDiscount,
  };
}
