const environment: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {};

function enabled(name: string, fallback = false): boolean {
  const value = environment[name];
  return value === undefined ? fallback : value === 'true';
}

export const FEATURE_FLAGS = {
  liveBenefitsScreening: enabled('EXPO_PUBLIC_LIVE_BENEFITS_SCREENING'),
  liveBenefitsCatalog: enabled('EXPO_PUBLIC_LIVE_BENEFITS_CATALOG'),
  fixtureFallback: enabled('EXPO_PUBLIC_BENEFITS_FIXTURE_FALLBACK', true),
  geminiEnhancement: enabled('EXPO_PUBLIC_GEMINI_ENABLED'),
} as const;
