import type { MockUserProfile, ProfileValidationResult } from './types';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INSURANCE_ELIGIBILITY_VALUES = new Set(['eligible', 'not_eligible', 'unknown']);
const FAIR_FARES_DISCOUNT_TYPES = new Set(['subway_bus', 'access_a_ride']);

export function validateProfile(profile: MockUserProfile): ProfileValidationResult {
  const issues: string[] = [];
  const dateOfBirth = profile.identity?.dateOfBirth;

  if (!profile.id.trim()) issues.push('id is required.');
  if (dateOfBirth && (!DATE_PATTERN.test(dateOfBirth) || Number.isNaN(Date.parse(dateOfBirth)))) {
    issues.push('identity.dateOfBirth must be an ISO date (YYYY-MM-DD).');
  }
  if (profile.household?.householdSize !== undefined && profile.household.householdSize < 1) {
    issues.push('household.householdSize must be at least 1.');
  }
  if (profile.household?.annualIncome !== undefined && profile.household.annualIncome < 0) {
    issues.push('household.annualIncome must not be negative.');
  }
  if (
    profile.transportation?.fairFaresDiscountType !== undefined &&
    !FAIR_FARES_DISCOUNT_TYPES.has(profile.transportation.fairFaresDiscountType)
  ) {
    issues.push('transportation.fairFaresDiscountType has an unsupported value.');
  }
  if (
    profile.healthcare?.insuranceEligibility !== undefined &&
    !INSURANCE_ELIGIBILITY_VALUES.has(profile.healthcare.insuranceEligibility)
  ) {
    issues.push('healthcare.insuranceEligibility has an unsupported value.');
  }

  return { isValid: issues.length === 0, issues };
}
