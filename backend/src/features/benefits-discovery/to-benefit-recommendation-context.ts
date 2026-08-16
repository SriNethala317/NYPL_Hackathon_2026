import { normalizeProfileForEligibility, type MockUserProfile } from '../eligibility';
import type { SafeRecommendationContext } from './types';

function incomeBand(annualIncome: number | undefined): SafeRecommendationContext['annualIncomeBand'] {
  if (annualIncome === undefined) return undefined;
  if (annualIncome < 25_000) return 'under_25k';
  if (annualIncome < 50_000) return '25k_to_50k';
  if (annualIncome < 100_000) return '50k_to_100k';
  return '100k_plus';
}

/**
 * Deliberately derived and non-identifying context for catalog matching. This
 * boundary prevents direct identifiers and raw income from reaching Gemini.
 */
export function toBenefitRecommendationContext(profile: MockUserProfile): SafeRecommendationContext {
  const eligibility = normalizeProfileForEligibility(profile);

  return {
    age: eligibility.age,
    nycResident: eligibility.nycResident,
    householdSize: eligibility.householdSize,
    annualIncomeBand: incomeBand(eligibility.annualIncome),
    employmentStatus: profile.benefits?.employmentStatus,
    studentStatus: profile.benefits?.studentStatus,
    hasInsurance: eligibility.hasInsurance,
    insuranceEligibility: eligibility.insuranceEligibility,
    transportationNeeds: eligibility.receivesTransportationDiscount === false,
  };
}
