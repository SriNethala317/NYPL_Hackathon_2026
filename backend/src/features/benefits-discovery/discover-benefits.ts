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
 * `generate-form-payload.ts` now falls back to a generic 9-field mapping
 * (`config/generic.mapping.ts`) for any program with no entry in `PROGRAM_FORM_MAPPINGS`, so
 * `/payload` genuinely works for the whole `detailedValidationSupported` set now (~49 of 97) —
 * not just the 3 programs with a real, hand-verified mapping. `formAutomationSupported` can
 * therefore honestly track `detailedValidationSupported` again (a program can only reach
 * `/payload` at all via an `eligibilityResult` that `/validate` produced, which only exists for
 * that same set) — but collapsing back to one boolean would hide *which kind* of mapping a
 * program gets, which is exactly the distinction that matters: `formAutomationSource` says
 * whether it's the real, per-program mapping or the generic fallback, so the frontend can't
 * present "core fields only" as if it were "this exact form was verified" — the same
 * false-advertising shape `formAutomationSupported` was fixed for last session, one level deeper.
 */
function formAutomationSupport(
  program: BenefitProgram,
  detailedValidationSupported: boolean,
): { supported: boolean; source?: 'program_specific' | 'generic_fields' } {
  if (!detailedValidationSupported) return { supported: false };
  const canonicalId = resolveCanonicalProgramIdForProgram(program);
  const source: 'program_specific' | 'generic_fields' =
    canonicalId !== undefined && canonicalId in PROGRAM_FORM_MAPPINGS ? 'program_specific' : 'generic_fields';
  return { supported: true, source };
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
      const formAutomation = formAutomationSupport(program, detailedValidationSupported);
      return {
        ...program,
        discoveryStatus: match.matchStatus,
        relevanceScore: match.relevanceScore,
        category: match.category ?? program.category,
        summary: program.description,
        whyItMayHelp: match.reason,
        missingInformation: match.missingInformation,
        detailedValidationSupported,
        formAutomationSupported: formAutomation.supported,
        formAutomationSource: formAutomation.source,
        discoverySource: byId.has(program.programId) ? 'gemini_catalog_match' : catalogFallback ? 'fixture_screening' : 'catalog_pre_filter',
        metadataSource: catalogFallback || program.source.type === 'fixture' ? 'fixture_catalog' : 'live_nyc_dataset',
        explanationSource: byId.has(program.programId) ? 'gemini' : 'official_description',
      };
    })
    .sort((left, right) => (right.relevanceScore ?? 0) - (left.relevanceScore ?? 0));
}
