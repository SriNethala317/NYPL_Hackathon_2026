import { GEMINI_CONFIG, normalizeGeminiModelName } from '@/config/gemini.config';

const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiAvailableModel {
  name: string;
  baseModelId?: string;
  supportedGenerationMethods?: string[];
}

export interface GeminiModelResolution {
  model: string;
  source: 'configured' | 'approved_fallback';
  fallbackModels: string[];
  availableModels: GeminiAvailableModel[];
}

export class GeminiModelDiscoveryError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly responseBody: string,
  ) {
    super([
      'Gemini model discovery failed.',
      `Status: ${status}`,
      `Status text: ${statusText}`,
      `Response: ${responseBody || '(empty response body)'}`,
    ].join('\n'));
    this.name = 'GeminiModelDiscoveryError';
  }
}

let cachedResolution: Promise<GeminiModelResolution> | undefined;

export async function listAvailableGeminiModels(apiKey: string): Promise<GeminiAvailableModel[]> {
  const response = await fetch(GEMINI_MODELS_URL, {
    headers: { 'x-goog-api-key': apiKey },
  });
  const responseBody = await response.text();
  if (!response.ok) {
    throw new GeminiModelDiscoveryError(response.status, response.statusText, responseBody);
  }

  const payload = JSON.parse(responseBody) as { models?: Array<Record<string, unknown>> };
  return (payload.models ?? [])
    .flatMap((model): GeminiAvailableModel[] => {
      if (typeof model.name !== 'string') return [];
      return [{
        name: normalizeGeminiModelName(model.name),
        baseModelId: typeof model.baseModelId === 'string' ? model.baseModelId : undefined,
        supportedGenerationMethods: Array.isArray(model.supportedGenerationMethods)
          ? model.supportedGenerationMethods.filter((method): method is string => typeof method === 'string')
          : undefined,
      }];
    })
    .filter((model) => model.supportedGenerationMethods?.includes('generateContent') ?? false);
}

export function resolveGeminiModel(
  configuredModel: string | undefined,
  approvedFallbackModels: readonly string[],
  availableModels: GeminiAvailableModel[],
): Omit<GeminiModelResolution, 'availableModels'> {
  const availableIds = new Set(
    availableModels
      .filter((model) => model.supportedGenerationMethods?.includes('generateContent') ?? false)
      .map((model) => normalizeGeminiModelName(model.name)),
  );
  const normalizedConfigured = configuredModel ? normalizeGeminiModelName(configuredModel) : undefined;
  const availableApprovedFallbacks = approvedFallbackModels
    .map(normalizeGeminiModelName)
    .filter((model, index, all) => availableIds.has(model) && all.indexOf(model) === index);

  if (normalizedConfigured && availableIds.has(normalizedConfigured)) {
    return {
      model: normalizedConfigured,
      source: 'configured',
      fallbackModels: availableApprovedFallbacks.filter((model) => model !== normalizedConfigured),
    };
  }

  const [fallback, ...remainingFallbacks] = availableApprovedFallbacks;
  if (fallback) return { model: fallback, source: 'approved_fallback', fallbackModels: remainingFallbacks };

  throw new Error([
    'No approved Gemini generateContent model is available for this API key/project.',
    `Configured model: ${normalizedConfigured ?? '(none)'}`,
    `Approved fallback models: ${approvedFallbackModels.join(', ') || '(none)'}`,
    `Available generateContent model IDs: ${[...availableIds].join(', ') || '(none)'}`,
  ].join('\n'));
}

export function resolveGeminiModelForConfiguredKey(): Promise<GeminiModelResolution> {
  if (!GEMINI_CONFIG.apiKey) throw new Error('Gemini is enabled but no API key is configured.');
  cachedResolution ??= listAvailableGeminiModels(GEMINI_CONFIG.apiKey).then((availableModels) => ({
    ...resolveGeminiModel(
      GEMINI_CONFIG.model,
      GEMINI_CONFIG.approvedModelFallbacks,
      availableModels,
    ),
    availableModels,
  }));
  return cachedResolution;
}
