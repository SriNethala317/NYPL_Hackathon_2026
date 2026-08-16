import { discoverBenefits, toBenefitRecommendationContext, toBenefitsScreeningInput } from '@/features/benefits-discovery';
import type { BenefitExplanationProvider } from '@/features/benefits-discovery/adapters/benefit-explanation-provider';
import { FixtureCatalogProvider } from '@/features/benefits-discovery/providers/fixture-catalog.provider';
import { buildGeminiEnhancementRequest } from '@/features/benefits-discovery/providers/gemini-benefit-explanation.provider';
import { FIXTURE_GEMINI_MATCHES } from './fixtures/gemini-matches';
import { VALID_NYC_PROFILE } from '../eligibility/fixtures/profiles';
export async function runDiscoveryScenarios(): Promise<void> {
  const catalogProvider = new FixtureCatalogProvider();
  if ((await discoverBenefits(VALID_NYC_PROFILE, { catalogProvider })).length <= 3) throw new Error('Catalog discovery must return more than three programs.');
  const failingGemini: BenefitExplanationProvider = { async enhance() { throw new Error('unavailable'); } };
  const fallback = await discoverBenefits(VALID_NYC_PROFILE, { catalogProvider, explanationProvider: failingGemini });
  if (!fallback.length || fallback.some((item) => item.discoverySource !== 'catalog_pre_filter')) throw new Error('Gemini provider-error fallback failed.');
  for (const failingProvider of [
    { async enhance() { throw new Error('missing key'); } },
    { async enhance() { throw new Error('timeout'); } },
    { async enhance() { throw new Error('invalid JSON'); } },
    { async enhance() { return [{ programId: 'invented_program', matchStatus: 'recommended_match', relevanceScore: 99, reason: 'Invalid fixture.' }] as never; } },
  ] satisfies BenefitExplanationProvider[]) {
    const result = await discoverBenefits(VALID_NYC_PROFILE, { catalogProvider, explanationProvider: failingProvider });
    if (!result.length || result.some((item) => item.discoverySource !== 'catalog_pre_filter')) throw new Error('Gemini fallback contract failed.');
  }
  const fixtureGemini: BenefitExplanationProvider = { async enhance(programs) { return FIXTURE_GEMINI_MATCHES.filter((match) => programs.some((program) => program.programId === match.programId)); } };
  const matches = await discoverBenefits(VALID_NYC_PROFILE, { catalogProvider, explanationProvider: fixtureGemini });
  if (matches.length <= 3 || !matches.some((match) => match.discoverySource === 'gemini_catalog_match')) throw new Error('Structured Gemini match fixture failed.');
  const input = toBenefitsScreeningInput(VALID_NYC_PROFILE) as Record<string, unknown>;
  const context = toBenefitRecommendationContext(VALID_NYC_PROFILE) as Record<string, unknown>;
  const request = buildGeminiEnhancementRequest(await catalogProvider.getPrograms(), context);
  for (const key of ['firstName', 'lastName', 'email', 'phone', 'street', 'dateOfBirth', 'sevisId', 'passportNumber']) if (key in input || JSON.stringify(context).includes(`\"${key}\"`) || JSON.stringify(request).includes(`\"${key}\"`)) throw new Error('PII leaked into a discovery boundary.');
}
