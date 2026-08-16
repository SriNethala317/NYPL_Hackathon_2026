import { GEMINI_CONFIG } from '@/config/gemini.config';
import type { BenefitExplanationProvider } from '../adapters/benefit-explanation-provider';
import type { BenefitProgram, BenefitRecommendationEnhancement, SafeRecommendationContext } from '../types';

export class GeminiBenefitExplanationProvider implements BenefitExplanationProvider {
  async enhance(programs: BenefitProgram[], context: SafeRecommendationContext): Promise<BenefitRecommendationEnhancement[]> {
    if (!GEMINI_CONFIG.apiKey) throw new Error('Gemini is enabled but no API key is configured.');
    const body = buildGeminiEnhancementRequest(programs, context);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CONFIG.model}:generateContent?key=${GEMINI_CONFIG.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Gemini request failed (${response.status}).`);
    const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed: unknown = text ? JSON.parse(text) : undefined;
    if (!Array.isArray(parsed)) throw new Error('Gemini returned an invalid enhancement shape.');
    return parsed.filter((item): item is BenefitRecommendationEnhancement => typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).programId === 'string' && typeof (item as Record<string, unknown>).category === 'string' && typeof (item as Record<string, unknown>).summary === 'string' && typeof (item as Record<string, unknown>).whyItMayHelp === 'string');
  }
}

export function buildGeminiEnhancementRequest(programs: BenefitProgram[], context: SafeRecommendationContext) {
  return { contents: [{ parts: [{ text: JSON.stringify({ task: 'Return JSON only. Summarize supplied official benefit metadata; do not determine eligibility or add facts.', context, programs: programs.map(({ programId, programName, category, description }) => ({ programId, programName, category, description })) }) }] }], generationConfig: { responseMimeType: 'application/json' } };
}
