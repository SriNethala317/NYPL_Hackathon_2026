import { checkEligibility } from '@/features/eligibility';
import { VALID_NYC_PROFILE } from './fixtures/profiles';

export function runEligibilityScenarios(): void {
  const cases = [
    [VALID_NYC_PROFILE, { fair_fares: 'potentially_eligible', idnyc: 'potentially_eligible', nyc_care: 'needs_more_information' }],
    [{ ...VALID_NYC_PROFILE, household: { householdSize: 1, annualIncome: 24_000 } }, { fair_fares: 'likely_not_eligible' }],
    [
      { ...VALID_NYC_PROFILE, residence: { city: 'Albany', state: 'NY', zipCode: '12207' } },
      {
        fair_fares: 'likely_not_eligible',
        // derive-criteria.mjs's residency heuristic previously missed "All New Yorkers ages 10 and
        // up qualify" (a blanket population claim, not a "resident(s) of NYC"/"live in NYC" phrase),
        // so IDNYC's derived criteria had no nycResident and this Albany profile fell through as
        // 'potentially_eligible'. Fixed by widening deriveResidency() to catch "New Yorker(s)" /
        // "anyone in NYC" phrasing; IDNYC's derived criteria now includes nycResident: true.
        idnyc: 'likely_not_eligible',
        nyc_care: 'likely_not_eligible',
      },
    ],
  ] as const;
  for (const [profile, expected] of cases) for (const [id, status] of Object.entries(expected)) if (checkEligibility(profile).find((result) => result.programId === id)?.status !== status) throw new Error(`Eligibility scenario failed for ${id}.`);
}
