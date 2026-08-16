import { FEATURE_FLAGS } from './feature-flags';

const environment: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {};

export const GEMINI_CONFIG = {
  enabled: FEATURE_FLAGS.geminiEnhancement,
  model: environment['GEMINI_MODEL'] ?? 'gemini-2.5-flash-lite',
  apiKey: environment['GEMINI_API_KEY'],
  timeoutMs: 8_000,
} as const;
