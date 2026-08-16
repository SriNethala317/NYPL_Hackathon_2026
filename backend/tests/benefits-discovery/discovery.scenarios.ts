import { discoverBenefits, toBenefitsScreeningInput } from '@/features/benefits-discovery';
import type { BenefitExplanationProvider } from '@/features/benefits-discovery/adapters/benefit-explanation-provider';
import { VALID_NYC_PROFILE } from '../eligibility/fixtures/profiles';
export async function runDiscoveryScenarios(): Promise<void> {
  if ((await discoverBenefits(VALID_NYC_PROFILE)).length <= 3) throw new Error('Fixture discovery must return more than three programs.');
  const failingGemini: BenefitExplanationProvider = { async enhance() { throw new Error('unavailable'); } };
  if (!(await discoverBenefits(VALID_NYC_PROFILE, { explanationProvider: failingGemini })).length) throw new Error('Gemini fallback failed.');
  const input = toBenefitsScreeningInput(VALID_NYC_PROFILE) as Record<string, unknown>;
  for (const key of ['firstName', 'lastName', 'email', 'phone', 'street', 'dateOfBirth']) if (key in input) throw new Error('PII leaked into screening input.');
}
