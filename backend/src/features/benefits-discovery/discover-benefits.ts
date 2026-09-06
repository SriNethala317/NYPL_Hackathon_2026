import { BENEFITS_CONFIG } from '@/config/benefits.config';
import { GEMINI_CONFIG } from '@/config/gemini.config';
import { criteriaFor, resolveCanonicalProgramIdForProgram, type MockUserProfile } from '../eligibility';
import { PROGRAM_FORM_MAPPINGS } from '../form-payload';
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
  // Either an aliased id/code/name (the 3 programs with an extension hook — see extensions.ts),
  // or any program checkEligibility() can now score generically (~49 of 97) — matched by the same
  // catalogue id the live NYC catalog provider's programId already is, case-insensitively.
  return resolveCanonicalProgramIdForProgram(program) !== undefined
    || criteriaFor(program.programId)?.scorable === true;
}

/**
 * A real form-payload mapping exists for exactly 3 programs (`PROGRAM_FORM_MAPPINGS` —
 * `fair-fares.mapping.ts`/`idnyc.mapping.ts`/`nyc-care.mapping.ts`), unrelated to how many
 * programs the generic eligibility engine can score. Confirmed by a real round trip: after the
 * generic-engine port, `detailedValidationSupported` correctly went from 3 programs to ~49, but
 * `formAutomationSupported` was wired to the same boolean and went with it — every one of those
 * programs *except* the 3 with a real mapping then 404'd on `/payload` with
 * `FORM_AUTOMATION_NOT_SUPPORTED`, despite this flag telling the caller otherwise. This checks
 * `PROGRAM_FORM_MAPPINGS` membership directly, resolved through the same canonical-id table so a
 * program's live-catalog id ("p120en") and its literal id ("fair_fares") both resolve to the same
 * answer — the same principle `program-id-resolver.ts` already applies everywhere else.
 */
function supportsFormAutomation(program: BenefitProgram): boolean {
  const canonicalId = resolveCanonicalProgramIdForProgram(program);
  return canonicalId !== undefined && canonicalId in PROGRAM_FORM_MAPPINGS;
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
        formAutomationSupported: supportsFormAutomation(program),
        discoverySource: byId.has(program.programId) ? 'gemini_catalog_match' : catalogFallback ? 'fixture_screening' : 'catalog_pre_filter',
        metadataSource: catalogFallback || program.source.type === 'fixture' ? 'fixture_catalog' : 'live_nyc_dataset',
        explanationSource: byId.has(program.programId) ? 'gemini' : 'official_description',
      };
    })
    .sort((left, right) => (right.relevanceScore ?? 0) - (left.relevanceScore ?? 0));
}
