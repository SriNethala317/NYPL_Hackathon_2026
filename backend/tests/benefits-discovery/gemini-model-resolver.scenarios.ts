import { resolveGeminiModel } from '@/features/benefits-discovery/providers/gemini-model-resolver';
import type { GeminiAvailableModel } from '@/features/benefits-discovery/providers/gemini-model-resolver';

const GENERATE_CONTENT_MODELS: GeminiAvailableModel[] = [
  { name: 'gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent'] },
  { name: 'gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] },
];

export function runGeminiModelResolverScenarios(): void {
  const configured = resolveGeminiModel('gemini-3.5-flash', ['gemini-3.1-flash-lite'], GENERATE_CONTENT_MODELS);
  if (configured.model !== 'gemini-3.5-flash' || configured.source !== 'configured') {
    throw new Error('Configured available Gemini model must be selected.');
  }

  const fallback = resolveGeminiModel('gemini-2.5-flash-lite', ['gemini-3.1-flash-lite'], GENERATE_CONTENT_MODELS);
  if (fallback.model !== 'gemini-3.1-flash-lite' || fallback.source !== 'approved_fallback') {
    throw new Error('Approved available Gemini fallback must be selected.');
  }

  const normalized = resolveGeminiModel('models/gemini-3.1-flash-lite', ['gemini-3.5-flash'], GENERATE_CONTENT_MODELS);
  if (normalized.model !== 'gemini-3.1-flash-lite' || normalized.source !== 'configured') {
    throw new Error('Gemini model prefixes must be normalized.');
  }

  assertThrows(
    () => resolveGeminiModel('gemini-2.5-flash-lite', ['gemini-3.6-flash'], GENERATE_CONTENT_MODELS),
    'Resolver must reject when no approved available model exists.',
  );
}

function assertThrows(action: () => void, message: string): void {
  try {
    action();
  } catch {
    return;
  }
  throw new Error(message);
}
