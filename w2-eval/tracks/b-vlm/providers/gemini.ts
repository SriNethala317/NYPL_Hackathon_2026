import { ProviderError, backoff, type VlmCall, type VlmProvider } from './types.ts';

/**
 * Google AI Studio, free tier.
 *
 * Chosen as this track's primary because its tokens-per-minute ceiling is far higher than Groq's,
 * which matters disproportionately for images: a single W-2 page can consume a large fraction of a
 * 6,000 TPM budget, and a 13-fixture sweep at three resolutions is 39 of them.
 *
 * The app already calls this API (`src/features/extraction/gemini-vision.ts`), and two decisions
 * are carried over from there because they were learned the hard way:
 *
 * - The key goes in the `x-goog-api-key` header, never the query string, so it cannot end up in a
 *   proxy log or a shell history.
 * - `thinkingBudget: 0`. Thinking tokens come out of the same budget as the answer, and a model
 *   that reasons at length about a W-2 runs out of room mid-JSON and returns a truncated object.
 *   Newer models reject the field outright, so it is sent optimistically and dropped on a 400 —
 *   see `callOnce`.
 *
 * ## Free-tier terms
 *
 * Prompts and responses may be used to improve Google's models, and an image sent here may be
 * retained and reviewed by a person. Synthetic fixtures only, without exception. This is also why
 * the track's structural disadvantage is real and not merely theoretical: it cannot run without
 * sending a photograph of a tax document to a third party.
 */

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Tried in order; a 404 or 503 advances to the next rather than failing the run.
 *
 * The order is measured, not assumed, and it is worth re-checking rather than trusting: model
 * names move faster than code does. Probed 2026-08-26 against this key:
 *
 *   gemini-3.5-flash     200 — read every field on the clean fixture correctly
 *   gemini-3.6-flash     recommended by the API's own 404 message for retired models
 *   gemini-flash-latest  503 "experiencing high demand"
 *   gemini-3.7-flash     503 "experiencing high demand"
 *   gemini-2.5-flash     404 "no longer available to new users"
 *   gemini-2.0-flash     404 "no longer available"
 *
 * The known-good model leads deliberately. Putting the newest first means every run pays two
 * failed round trips before it gets an answer, and the newest flash model being under load is the
 * normal state rather than the exception. `GEMINI_MODEL` overrides the whole list.
 *
 * ## The daily cap is a property of the model, not of the free tier
 *
 * The 429 that kept killing runs names its own quota:
 *
 *     quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier
 *     quotaValue: 20
 *
 * Twenty requests per day, per model — which a single 17-fixture run all but exhausts. That cap
 * belongs to the **3.x preview** models, not to the free tier generally; the lite and GA models
 * carry far higher daily allowances. Leading with `flash-lite` is therefore worth roughly two
 * orders of magnitude of headroom for the cost of one string, and it is why the order changed.
 *
 * Because the quota is per *model*, the cascade also spreads load: exhausting one model's day
 * does not exhaust the next one's.
 */
const MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
];

const TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 4;

/**
 * Free tier, so the real cost of this run is zero. These figures exist to answer "what would this
 * cost at volume", which is the more useful question.
 *
 * Indicative Flash-tier pricing per million tokens, NOT read from a live price list. The token
 * counts in the report are real — taken from `usageMetadata` on every response — so if the rate is
 * stale the ranking between engines still holds and only the absolute dollar figure moves.
 */
const USD_PER_MILLION = { input: 0.075, output: 0.3 };

function apiKey(): string | undefined {
  return (process.env.GEMINI_API_KEY ?? process.env.EXPO_PUBLIC_GEMINI_API_KEY)?.trim() || undefined;
}

type GeminiResponse = {
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string }[] };
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

export function createGemini(model?: string): VlmProvider {
  const override = model ?? process.env.GEMINI_MODEL?.trim();
  const models = override ? [override] : MODELS;

  return {
    name: `gemini:${models[0]}`,
    sendsImagesTo: 'Google',

    isAvailable: () => apiKey() !== undefined,
    unavailableReason: () =>
      'GEMINI_API_KEY is not set. Add it to w2-eval/.env (the app’s EXPO_PUBLIC_GEMINI_API_KEY also works).',

    async extract(imageBase64: string, prompt: string): Promise<VlmCall> {
      const key = apiKey();
      if (key === undefined) throw new ProviderError('No Gemini API key configured.', false);

      /*
       * Every model's failure is collected, not just the last one.
       *
       * An earlier version reported only `lastError`, and a run that actually died because the
       * primary model was out of quota was reported as "gemini-3.6-flash returned 400" — the
       * symptom from the fallback, not the cause. When a cascade fails, the useful artefact is the
       * whole cascade.
       */
      const failures: string[] = [];

      for (const name of models) {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
          try {
            return await callOnce(key, name, imageBase64, prompt);
          } catch (error) {
            const failure =
              error instanceof ProviderError ? error : new ProviderError(String(error), false);
            failures.push(`${name}: ${failure.message}`);

            // Retired, overloaded, or out of quota: another attempt on this model changes nothing.
            // A daily quota in particular is not a rate limit -- backing off just wastes the wait.
            if (failure.status === 404 || failure.status === 503 || isQuotaExhausted(failure)) break;
            if (!failure.retryable) throw failure;
            await backoff(attempt);
          }
        }
      }

      throw new ProviderError(
        `Gemini exhausted every model. ${failures.join(' | ')}`,
        false,
      );
    },
  };
}

/**
 * A 429 that means "you are out of quota for the day", not "you are going too fast".
 *
 * The distinction matters: the second is worth waiting out and the first never is. Both arrive as
 * 429, so the message is the only thing that separates them.
 */
function isQuotaExhausted(error: ProviderError): boolean {
  return error.status === 429 && /quota|billing/i.test(error.message);
}

/**
 * One request.
 *
 * `thinkingConfig` is sent optimistically and dropped on a 400. Measured 2026-08-26:
 * `gemini-3.5-flash` accepts `thinkingBudget: 0`, `gemini-3.6-flash` rejects the whole request
 * with "Request contains an invalid argument" and no indication of which argument. Rather than
 * maintaining a per-model allow-list that goes stale the next time a model ships, the request
 * retries itself once without the field. That keeps the cascade working across model generations,
 * and the warning records that it happened.
 */
async function callOnce(
  key: string,
  model: string,
  imageBase64: string,
  prompt: string,
  withThinkingConfig = true,
): Promise<VlmCall> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${API_ROOT}/${model}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
          // Thinking tokens share the output budget; at length they truncate the JSON.
          ...(withThinkingConfig ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);

      // The one 400 worth retrying: this model does not accept thinkingConfig.
      if (response.status === 400 && withThinkingConfig) {
        clearTimeout(timer);
        const retried = await callOnce(key, model, imageBase64, prompt, false);
        return { ...retried, latencyMs: Date.now() - started };
      }

      throw new ProviderError(
        `Gemini ${model} returned ${response.status}: ${detail.replace(/\s+/g, ' ')}`,
        response.status === 429 || response.status >= 500,
        response.status,
      );
    }

    const body = (await response.json()) as GeminiResponse;
    const latencyMs = Date.now() - started;

    if (body.promptFeedback?.blockReason) {
      throw new ProviderError(`Gemini refused the request: ${body.promptFeedback.blockReason}`, false);
    }

    const candidate = body.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    const promptTokens = body.usageMetadata?.promptTokenCount ?? null;
    const completionTokens = body.usageMetadata?.candidatesTokenCount ?? null;

    return {
      text:
        candidate?.finishReason === 'MAX_TOKENS'
          ? `${text}\n<!-- truncated: MAX_TOKENS -->`
          : text,
      latencyMs,
      costUsd:
        ((promptTokens ?? 0) * USD_PER_MILLION.input +
          (completionTokens ?? 0) * USD_PER_MILLION.output) /
        1_000_000,
      promptTokens,
      completionTokens,
      raw: body,
    };
  } finally {
    clearTimeout(timer);
  }
}
