import { FEATURE_FLAGS } from './feature-flags';

const environment: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {};

// These models are intentionally approved for the existing text + JSON-schema
// workflow. Runtime selection still requires Models API availability and
// generateContent support for the configured key.
export const GEMINI_APPROVED_MODEL_FALLBACKS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
] as const;

export function normalizeGeminiModelName(model: string): string {
  return model.trim().replace(/^(models\/)+/, '');
}

function configuredTimeout(value: string | undefined): number {
  const timeoutMs = Number(value);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30_000;
}

export const GEMINI_CONFIG = {
  enabled: FEATURE_FLAGS.geminiEnhancement,
  model: environment['GEMINI_MODEL'] ? normalizeGeminiModelName(environment['GEMINI_MODEL']) : undefined,
  approvedModelFallbacks: GEMINI_APPROVED_MODEL_FALLBACKS,
  apiKey: environment['GEMINI_API_KEY'],
  timeoutMs: configuredTimeout(environment['GEMINI_TIMEOUT_MS']),
} as const;
