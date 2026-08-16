const environment: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {};

function enabled(name: string, fallback = false): boolean {
  const value = environment[name];
  return value === undefined ? fallback : value === 'true';
}

export const FEATURE_FLAGS = {
  liveBenefitsScreening: enabled('LIVE_BENEFITS_SCREENING'),
  // The official catalog is the preferred broad-discovery source; fixtures remain a safe fallback.
  liveBenefitsCatalog: enabled('LIVE_BENEFITS_CATALOG', true),
  fixtureFallback: enabled('BENEFITS_FIXTURE_FALLBACK', true),
  geminiEnhancement: enabled('GEMINI_ENABLED'),
} as const;
