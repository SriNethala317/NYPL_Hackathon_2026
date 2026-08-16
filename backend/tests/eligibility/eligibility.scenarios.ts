import { checkEligibility } from '@/features/eligibility';
import { VALID_NYC_PROFILE } from './fixtures/profiles';

export function runEligibilityScenarios(): void {
  const cases = [
    [VALID_NYC_PROFILE, { fair_fares: 'potentially_eligible', idnyc: 'potentially_eligible', nyc_care: 'needs_more_information' }],
    [{ ...VALID_NYC_PROFILE, household: { householdSize: 1, annualIncome: 24_000 } }, { fair_fares: 'likely_not_eligible' }],
    [{ ...VALID_NYC_PROFILE, residence: { city: 'Albany', state: 'NY', zipCode: '12207' } }, { fair_fares: 'likely_not_eligible', idnyc: 'likely_not_eligible', nyc_care: 'likely_not_eligible' }],
  ] as const;
  for (const [profile, expected] of cases) for (const [id, status] of Object.entries(expected)) if (checkEligibility(profile).find((result) => result.programId === id)?.status !== status) throw new Error(`Eligibility scenario failed for ${id}.`);
}
