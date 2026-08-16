import { BENEFITS_CONFIG } from '@/config/benefits.config';
import { GEMINI_CONFIG } from '@/config/gemini.config';
import type { MockUserProfile } from '../eligibility';
import type { BenefitExplanationProvider } from './adapters/benefit-explanation-provider';
import type { BenefitsCatalogProvider } from './adapters/benefits-catalog-provider';
import type { BenefitsScreeningProvider } from './adapters/benefits-screening-provider';
import { preFilterPrograms } from './pre-filter-programs';
import { GeminiBenefitExplanationProvider } from './providers/gemini-benefit-explanation.provider';
import { FixtureCatalogProvider } from './providers/fixture-catalog.provider';
import { NycBenefitsCatalogProvider } from './providers/nyc-benefits-catalog.provider';
import { toBenefitRecommendationContext } from './to-benefit-recommendation-context';
import type { BenefitProgram, BenefitRecommendation, GeminiProgramMatch } from './types';

export interface DiscoveryDependencies {
  /** Retained for callers that supply an official screening provider; catalog matching does not require it. */
  screeningProvider?: BenefitsScreeningProvider;
  catalogProvider?: BenefitsCatalogProvider;
  explanationProvider?: BenefitExplanationProvider;
}

function supportsDetailedValidation(program: BenefitProgram): boolean {
  return (BENEFITS_CONFIG.deepValidationProgramIds as readonly string[]).includes(program.programId)
    || (BENEFITS_CONFIG.deepValidationProgramCodes as readonly string[]).includes(program.programCode ?? '')
    || (BENEFITS_CONFIG.deepValidationProgramNames as readonly string[]).includes(program.programName);
}

function fallbackMatch(program: BenefitProgram, index: number): GeminiProgramMatch {
  return {
    programId: program.programId,
    matchStatus: program.description ? 'possible_match' : 'needs_more_information',
    relevanceScore: Math.max(1, 60 - index),
    reason: 'Selected from official NYC program metadata using a non-eligibility relevance pre-filter.',
  };
}

/**
 * Broad catalog discovery only. It intentionally does not invoke detailed
 * validators or depend on NYC Screening API credentials.
 */
export async function discoverBenefits(profile: MockUserProfile, dependencies: DiscoveryDependencies = {}): Promise<BenefitRecommendation[]> {
  const catalog = dependencies.catalogProvider ?? (BENEFITS_CONFIG.liveCatalogEnabled ? new NycBenefitsCatalogProvider() : new FixtureCatalogProvider());
  let programs: BenefitProgram[];
  let catalogFallback = false;
  try {
    programs = await catalog.getPrograms();
  } catch (error) {
    if (!BENEFITS_CONFIG.fixtureFallbackEnabled) throw error;
    catalogFallback = true;
    programs = await new FixtureCatalogProvider().getPrograms();
  }

  const context = toBenefitRecommendationContext(profile);
  const candidates = preFilterPrograms(programs, context);
  const explainer = dependencies.explanationProvider ?? (GEMINI_CONFIG.enabled ? new GeminiBenefitExplanationProvider() : undefined);
  let matches: GeminiProgramMatch[] = [];
  if (explainer) {
    try {
      matches = await explainer.enhance(candidates, context);
    } catch {
      // Official catalog results remain useful when Gemini is unavailable.
      matches = [];
    }
  }

  const byId = new Map(matches.map((match) => [match.programId, match]));
  return candidates
    .map((program, index): BenefitRecommendation => {
      const match = byId.get(program.programId) ?? fallbackMatch(program, index);
      const detailedValidationSupported = supportsDetailedValidation(program);
      return {
        ...program,
        discoveryStatus: match.matchStatus,
        relevanceScore: match.relevanceScore,
        category: match.category ?? program.category,
        summary: program.description,
        whyItMayHelp: match.reason,
        missingInformation: match.missingInformation,
        detailedValidationSupported,
        formAutomationSupported: detailedValidationSupported
          && ((BENEFITS_CONFIG.formAutomationProgramIds as readonly string[]).includes(program.programId)
            || (BENEFITS_CONFIG.deepValidationProgramCodes as readonly string[]).includes(program.programCode ?? '')
            || (BENEFITS_CONFIG.deepValidationProgramNames as readonly string[]).includes(program.programName)),
        discoverySource: byId.has(program.programId) ? 'gemini_catalog_match' : catalogFallback ? 'fixture_screening' : 'catalog_pre_filter',
        metadataSource: catalogFallback || program.source.type === 'fixture' ? 'fixture_catalog' : 'live_nyc_dataset',
        explanationSource: byId.has(program.programId) ? 'gemini' : 'official_description',
      };
    })
    .sort((left, right) => (right.relevanceScore ?? 0) - (left.relevanceScore ?? 0));
}
