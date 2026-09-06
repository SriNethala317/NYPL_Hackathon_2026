import type { EligibilityInput } from './types';

/**
 * Program-specific rules the generic, criteria-table-driven evaluator cannot express — not
 * because a column is missing, but because these are a categorically different kind of condition
 * (cross-benefit exclusivity, an external insurance/affordability screening result) than the
 * shared age/income/residency/document shape every other program's criteria fit into. Confirmed
 * in `database/generic_eligibility_engine_scoping.md`: of the 3 originally-hardcoded validators,
 * only IDNYC's (residency + min age) was already fully generic-shaped.
 *
 * Each hook checks *only* the extra condition — age/income/residency for these two programs are
 * already covered by their real seeded criteria and evaluated generically. This is the same logic
 * `programs/fair-fares.ts` and `programs/nyc-care.ts` always had for these specific checks; lifted
 * out rather than duplicated so the two files can be deleted once nothing else references them.
 */

export type ExtensionCheck = {
  reasonDetails: { code: string; sourceText?: string }[];
  missingFields: string[];
};

export function fairFaresExtension(input: EligibilityInput): ExtensionCheck {
  const reasonDetails: ExtensionCheck['reasonDetails'] = [];
  const missingFields: string[] = [];

  if (input.receivesFullCarfare === undefined) missingFields.push('receivesFullCarfare');
  else if (input.receivesFullCarfare) {
    reasonDetails.push({
      code: 'receives-full-carfare',
      sourceText: 'Applicant receives or is eligible for full carfare from a NYC agency.',
    });
  }

  if (input.receivesTransportationDiscount === undefined) {
    missingFields.push('receivesTransportationDiscount');
  } else if (input.receivesTransportationDiscount && input.fairFaresDiscountType === undefined) {
    missingFields.push('fairFaresDiscountType');
  } else if (input.receivesTransportationDiscount && input.fairFaresDiscountType === 'subway_bus') {
    reasonDetails.push({
      code: 'receives-transportation-discount',
      sourceText: 'Applicant receives or is eligible for another transportation discount program for subway and bus service.',
    });
  }

  return { reasonDetails, missingFields };
}

export function nycCareExtension(input: EligibilityInput): ExtensionCheck {
  const reasonDetails: ExtensionCheck['reasonDetails'] = [];
  const missingFields: string[] = [];

  // "This engine never infers it from income" — preserved from the original validator's own
  // comment: NYC Care requires a formal insurance and affordability screening.
  if (input.insuranceEligibility === undefined || input.insuranceEligibility === 'unknown') {
    missingFields.push('insuranceEligibility');
  } else if (input.insuranceEligibility === 'eligible') {
    reasonDetails.push({
      code: 'insurance-eligible',
      sourceText: 'Applicant is eligible for a New York State health insurance plan.',
    });
  }

  if (input.canAffordInsurance === undefined) missingFields.push('canAffordInsurance');
  else if (input.canAffordInsurance) {
    reasonDetails.push({
      code: 'can-afford-insurance',
      sourceText: 'Applicant can afford available health insurance based on their screening.',
    });
  }

  return { reasonDetails, missingFields };
}

/** Canonical id -> its extension hook, per `program-id-resolver.ts`'s alias table. */
export const PROGRAM_EXTENSIONS: Record<string, (input: EligibilityInput) => ExtensionCheck> = {
  fair_fares: fairFaresExtension,
  nyc_care: nycCareExtension,
};
