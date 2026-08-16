import type { EligibilityInput, MockUserProfile } from './types';

const NYC_BOROUGHS = new Set(['bronx', 'brooklyn', 'manhattan', 'queens', 'staten island']);

function calculateAge(dateOfBirth?: string, today = new Date()): number | undefined {
  if (!dateOfBirth || Number.isNaN(Date.parse(dateOfBirth))) return undefined;
  const birthDate = new Date(`${dateOfBirth}T00:00:00`);
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const birthdayHasOccurred =
    today.getUTCMonth() > birthDate.getUTCMonth() ||
    (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() >= birthDate.getUTCDate());
  if (!birthdayHasOccurred) age -= 1;
  return age >= 0 ? age : undefined;
}

function isNYCResident(profile: MockUserProfile): boolean | undefined {
  const residence = profile.residence;
  if (!residence) return undefined;
  if (residence.borough && NYC_BOROUGHS.has(residence.borough.trim().toLowerCase())) return true;
  if (!residence.city || !residence.state) return undefined;

  const city = residence.city.trim().toLowerCase();
  const state = residence.state.trim().toLowerCase();
  const isNewYorkState = state === 'ny' || state === 'new york';
  const nycCityNames = new Set(['new york', 'new york city', 'bronx', 'brooklyn', 'manhattan', 'queens', 'staten island']);
  return isNewYorkState && nycCityNames.has(city);
}

function validHouseholdSize(value?: number): number | undefined {
  return value !== undefined && Number.isInteger(value) && value >= 1 ? value : undefined;
}

function validAnnualIncome(value?: number): number | undefined {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Produces only derived or program-relevant facts; it intentionally omits identity and contact PII. */
export function normalizeProfileForEligibility(profile: MockUserProfile, today?: Date): EligibilityInput {
  return {
    age: calculateAge(profile.identity?.dateOfBirth, today),
    nycResident: isNYCResident(profile),
    householdSize: validHouseholdSize(profile.household?.householdSize),
    annualIncome: validAnnualIncome(profile.household?.annualIncome),
    hasInsurance: profile.healthcare?.hasInsurance,
    insuranceEligibility: profile.healthcare?.insuranceEligibility,
    canAffordInsurance: profile.healthcare?.canAffordInsurance,
    receivesTransportationDiscount: profile.transportation?.receivesTransportationDiscount,
    receivesFullCarfare: profile.transportation?.receivesFullCarfare,
    fairFaresDiscountType: profile.transportation?.fairFaresDiscountType,
  };
}
