import { BENEFITS_CONFIG } from '@/config/benefits.config';
import { GEMINI_CONFIG } from '@/config/gemini.config';
import type { MockUserProfile } from '../eligibility';
import type { BenefitExplanationProvider } from './adapters/benefit-explanation-provider';
import type { BenefitsCatalogProvider } from './adapters/benefits-catalog-provider';
import type { BenefitsScreeningProvider } from './adapters/benefits-screening-provider';
import { toBenefitsScreeningInput } from './to-benefits-screening-input';
import { GeminiBenefitExplanationProvider } from './providers/gemini-benefit-explanation.provider';
import { FixtureCatalogProvider } from './providers/fixture-catalog.provider';
import { FixtureScreeningProvider } from './providers/fixture-screening.provider';
import { NycBenefitsCatalogProvider } from './providers/nyc-benefits-catalog.provider';
import { NycScreeningProvider } from './providers/nyc-screening.provider';
import type { BenefitRecommendation, BenefitRecommendationEnhancement } from './types';

export interface DiscoveryDependencies { screeningProvider?: BenefitsScreeningProvider; catalogProvider?: BenefitsCatalogProvider; explanationProvider?: BenefitExplanationProvider; }

export async function discoverBenefits(profile: MockUserProfile, dependencies: DiscoveryDependencies = {}): Promise<BenefitRecommendation[]> {
  const screening = dependencies.screeningProvider ?? (BENEFITS_CONFIG.liveScreeningEnabled ? new NycScreeningProvider() : new FixtureScreeningProvider());
  const catalog = dependencies.catalogProvider ?? (BENEFITS_CONFIG.liveCatalogEnabled ? new NycBenefitsCatalogProvider() : new FixtureCatalogProvider());
  let screeningResult;
  let screeningFallback = false;
  try { screeningResult = await screening.screen(toBenefitsScreeningInput(profile)); }
  catch (error) { if (!BENEFITS_CONFIG.fixtureFallbackEnabled) throw error; screeningFallback = true; screeningResult = await new FixtureScreeningProvider().screen(toBenefitsScreeningInput(profile)); }
  let programs;
  let catalogFallback = false;
  try { programs = await catalog.getPrograms(screeningResult.matches.map((match) => match.programCode).filter((code): code is string => Boolean(code))); }
  catch (error) { if (!BENEFITS_CONFIG.fixtureFallbackEnabled) throw error; catalogFallback = true; programs = await new FixtureCatalogProvider().getPrograms(screeningResult.matches.map((match) => match.programCode).filter((code): code is string => Boolean(code))); }
  let enhancements: BenefitRecommendationEnhancement[] = [];
  const explainer = dependencies.explanationProvider ?? (GEMINI_CONFIG.enabled ? new GeminiBenefitExplanationProvider() : undefined);
  if (explainer) { try { enhancements = await explainer.enhance(programs, { nycResident: toBenefitsScreeningInput(profile).nycResident }); } catch { enhancements = []; } }
  return programs.map((program) => {
    const match = screeningResult.matches.find((item) => item.programCode === program.programCode);
    const enhancement = enhancements.find((item) => item.programId === program.programId);
    return { ...program, discoveryStatus: match?.needsMoreInformation ? 'needs_more_information' : 'potential_match', category: enhancement?.category ?? program.category, summary: enhancement?.summary ?? program.description, whyItMayHelp: enhancement?.whyItMayHelp, detailedValidationSupported: (BENEFITS_CONFIG.deepValidationProgramIds as readonly string[]).includes(program.programId), formAutomationSupported: (BENEFITS_CONFIG.formAutomationProgramIds as readonly string[]).includes(program.programId), discoverySource: screeningFallback || screeningResult.sourceType === 'fixture' ? 'fixture_screening' : 'live_nyc_screening', metadataSource: catalogFallback || program.source.type === 'fixture' ? 'fixture_catalog' : 'live_nyc_dataset', explanationSource: enhancement ? 'gemini' : 'official_description' };
  });
}
