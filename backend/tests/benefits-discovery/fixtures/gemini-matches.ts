import type { GeminiProgramMatch } from '@/features/benefits-discovery';

/** Deterministic structured response used instead of a live Gemini request. */
export const FIXTURE_GEMINI_MATCHES: GeminiProgramMatch[] = [
  { programId: 'fair_fares', matchStatus: 'recommended_match', relevanceScore: 92, reason: 'Transportation assistance may be useful.' },
  { programId: 'snap', matchStatus: 'recommended_match', relevanceScore: 88, reason: 'Food support may be useful.' },
  { programId: 'nyc_care', matchStatus: 'possible_match', relevanceScore: 80, reason: 'Health care information may be useful.' },
  { programId: 'idnyc', matchStatus: 'possible_match', relevanceScore: 76, reason: 'A municipal ID may be useful.' },
  { programId: 'heap', matchStatus: 'needs_more_information', relevanceScore: 65, reason: 'Energy support may be useful.', missingInformation: ['heating arrangement'] },
];
