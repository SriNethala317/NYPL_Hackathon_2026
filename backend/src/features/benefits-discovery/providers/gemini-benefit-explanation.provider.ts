import { GEMINI_CONFIG } from '@/config/gemini.config';
import type { BenefitExplanationProvider } from '../adapters/benefit-explanation-provider';
import type { BenefitProgram, GeminiProgramMatch, SafeRecommendationContext } from '../types';

const MATCH_STATUSES = new Set(['recommended_match', 'possible_match', 'needs_more_information']);

function isGeminiProgramMatch(value: unknown, allowedIds: Set<string>): value is GeminiProgramMatch {
  if (typeof value !== 'object' || value === null) return false;
  const match = value as Record<string, unknown>;
  return typeof match.programId === 'string'
    && allowedIds.has(match.programId)
    && typeof match.matchStatus === 'string'
    && MATCH_STATUSES.has(match.matchStatus)
    && typeof match.relevanceScore === 'number'
    && Number.isFinite(match.relevanceScore)
    && match.relevanceScore >= 0
    && match.relevanceScore <= 100
    && typeof match.reason === 'string'
    && (match.category === undefined || typeof match.category === 'string')
    && (match.missingInformation === undefined || (Array.isArray(match.missingInformation) && match.missingInformation.every((item) => typeof item === 'string')));
}

export class GeminiBenefitExplanationProvider implements BenefitExplanationProvider {
  async enhance(programs: BenefitProgram[], context: SafeRecommendationContext): Promise<GeminiProgramMatch[]> {
    if (!GEMINI_CONFIG.apiKey) throw new Error('Gemini is enabled but no API key is configured.');
    const body = buildGeminiEnhancementRequest(programs, context);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_CONFIG.timeoutMs);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CONFIG.model}:generateContent?key=${GEMINI_CONFIG.apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Gemini request failed (${response.status}).`);
      const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed: unknown = text ? JSON.parse(text) : undefined;
      if (!Array.isArray(parsed)) throw new Error('Gemini returned an invalid match shape.');
      const allowedIds = new Set(programs.map((program) => program.programId));
      const matches = parsed.filter((item): item is GeminiProgramMatch => isGeminiProgramMatch(item, allowedIds));
      if (!matches.length && parsed.length) throw new Error('Gemini returned no valid catalog matches.');
      return matches.sort((left, right) => right.relevanceScore - left.relevanceScore);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Builds the only payload that may cross the Gemini privacy boundary. */
export function buildGeminiEnhancementRequest(programs: BenefitProgram[], context: SafeRecommendationContext) {
  return {
    contents: [{ parts: [{ text: JSON.stringify({
      task: 'Rank only the supplied official NYC benefits programs by relevance to the supplied non-identifying user context. Do not determine official eligibility, invent requirements, or add programs. Return JSON only.',
      context,
      programs: programs.map(({ programId, programName, description, eligibilityText }) => ({ programId, programName, description, eligibilityText })),
    }) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          required: ['programId', 'matchStatus', 'relevanceScore', 'reason'],
          properties: {
            programId: { type: 'STRING' },
            matchStatus: { type: 'STRING', enum: ['recommended_match', 'possible_match', 'needs_more_information'] },
            relevanceScore: { type: 'NUMBER', minimum: 0, maximum: 100 },
            category: { type: 'STRING' },
            reason: { type: 'STRING' },
            missingInformation: { type: 'ARRAY', items: { type: 'STRING' } },
          },
        },
      },
    },
  };
}
