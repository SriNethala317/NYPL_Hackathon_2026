import { GEMINI_CONFIG, normalizeGeminiModelName } from '@/config/gemini.config';
import type { BenefitExplanationProvider } from '../adapters/benefit-explanation-provider';
import type { BenefitProgram, GeminiProgramMatch, SafeRecommendationContext } from '../types';
import { resolveGeminiModelForConfiguredKey } from './gemini-model-resolver';

const MATCH_STATUSES = new Set(['recommended_match', 'possible_match', 'needs_more_information']);
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly model: string,
    public readonly url: string,
    public readonly responseBody: string,
  ) {
    super([
      'Gemini request failed.',
      `Status: ${status}`,
      `Status text: ${statusText}`,
      `Model: ${model}`,
      `URL: ${url}`,
      `Response: ${responseBody || '(empty response body)'}`,
    ].join('\n'));
    this.name = 'GeminiRequestError';
  }
}

export function isGeminiModelUnavailableError(error: unknown): error is GeminiRequestError {
  return error instanceof GeminiRequestError
    && error.status === 404
    && /model/i.test(error.responseBody)
    && /(not available|no longer available|not found)/i.test(error.responseBody);
}

export function buildGeminiGenerateContentUrl(model: string): string {
  const normalizedModel = normalizeGeminiModelName(model);
  if (!normalizedModel) throw new Error('Gemini model is not configured.');
  return `${GEMINI_API_BASE_URL}/models/${normalizedModel}:generateContent`;
}

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
  constructor(private readonly onModelAttempt?: (model: string) => void) {}

  async enhance(programs: BenefitProgram[], context: SafeRecommendationContext): Promise<GeminiProgramMatch[]> {
    if (!GEMINI_CONFIG.apiKey) throw new Error('Gemini is enabled but no API key is configured.');
    const body = buildGeminiEnhancementRequest(programs, context);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_CONFIG.timeoutMs);
    try {
      const resolution = await resolveGeminiModelForConfiguredKey();
      const candidateModels = [resolution.model, ...resolution.fallbackModels];
      let lastModelError: GeminiRequestError | undefined;

      for (const model of candidateModels) {
        this.onModelAttempt?.(model);
        try {
          return await this.enhanceWithModel(programs, body, model, controller.signal);
        } catch (error) {
          if (isGeminiModelUnavailableError(error) && model !== candidateModels[candidateModels.length - 1]) {
            lastModelError = error;
            continue;
          }
          throw error;
        }
      }

      throw lastModelError ?? new Error('No Gemini model was selected.');
    } finally {
      clearTimeout(timer);
    }
  }

  private async enhanceWithModel(
    programs: BenefitProgram[],
    body: ReturnType<typeof buildGeminiEnhancementRequest>,
    model: string,
    signal: AbortSignal,
  ): Promise<GeminiProgramMatch[]> {
    const url = buildGeminiGenerateContentUrl(model);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_CONFIG.apiKey ?? '',
      },
      body: JSON.stringify(body),
      signal,
    });
    const responseBody = await response.text();
    if (!response.ok) {
      throw new GeminiRequestError(response.status, response.statusText, model, url, responseBody);
    }
    const data = JSON.parse(responseBody) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed: unknown = text ? JSON.parse(text) : undefined;
    if (!Array.isArray(parsed)) throw new Error('Gemini returned an invalid match shape.');
    const allowedIds = new Set(programs.map((program) => program.programId));
    const matches = parsed.filter((item): item is GeminiProgramMatch => isGeminiProgramMatch(item, allowedIds));
    if (!matches.length && parsed.length) throw new Error('Gemini returned no valid catalog matches.');
    return matches.sort((left, right) => right.relevanceScore - left.relevanceScore);
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
