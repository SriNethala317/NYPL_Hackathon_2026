import { ProviderError, backoff, type VlmCall, type VlmProvider } from './types.ts';

/**
 * Groq's multimodal offering.
 *
 * Fast per token, and restrictive per minute. The free tier's ~6,000 TPM ceiling is awkward for
 * text and genuinely constraining for images, where a single W-2 page can consume a large share of
 * the whole per-minute budget. Expect 429s during a batch run.
 *
 * **Measuring how badly that constrains throughput is part of the point**, not an obstacle to
 * working around. A provider that is fast in isolation and unusable in a batch is a real finding
 * about production viability, so every 429 is counted and surfaced in the report rather than being
 * quietly absorbed by the backoff.
 */

const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

const TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 5;

/** Groq publishes per-million-token pricing; the free tier bills nothing. */
const USD_PER_MILLION = { input: 0.11, output: 0.34 };

function apiKey(): string | undefined {
  return process.env.GROQ_API_KEY?.trim() || undefined;
}

type GroqResponse = {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

export function createGroqVision(model = DEFAULT_MODEL): VlmProvider {
  return {
    name: `groq:${model.split('/').pop()}`,
    sendsImagesTo: 'Groq',

    isAvailable: () => apiKey() !== undefined,
    unavailableReason: () =>
      'GROQ_API_KEY is not set. Create a free key at console.groq.com and add it to w2-eval/.env.',

    async extract(imageBase64: string, prompt: string): Promise<VlmCall> {
      const key = apiKey();
      if (key === undefined) throw new ProviderError('No Groq API key configured.', false);

      const rateLimits: string[] = [];

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const started = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
          const response = await fetch(API_URL, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
            body: JSON.stringify({
              model,
              temperature: 0,
              response_format: { type: 'json_object' },
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: prompt },
                    {
                      type: 'image_url',
                      image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
                    },
                  ],
                },
              ],
            }),
          });

          if (response.status === 429) {
            const retryAfter = response.headers.get('retry-after');
            rateLimits.push(`429 on attempt ${attempt + 1}${retryAfter ? ` (retry-after ${retryAfter}s)` : ''}`);
            await backoff(attempt);
            continue;
          }

          if (!response.ok) {
            const detail = (await response.text()).slice(0, 300);
            throw new ProviderError(
              `Groq returned ${response.status}: ${detail}`,
              response.status >= 500,
              response.status,
            );
          }

          const body = (await response.json()) as GroqResponse;
          if (body.error) throw new ProviderError(`Groq: ${body.error.message}`, false);

          const promptTokens = body.usage?.prompt_tokens ?? null;
          const completionTokens = body.usage?.completion_tokens ?? null;

          return {
            text: body.choices?.[0]?.message?.content ?? '',
            latencyMs: Date.now() - started,
            costUsd:
              ((promptTokens ?? 0) * USD_PER_MILLION.input +
                (completionTokens ?? 0) * USD_PER_MILLION.output) /
              1_000_000,
            promptTokens,
            completionTokens,
            // Rate limits ride along on the raw payload so the report can count them per fixture.
            raw: { ...body, rateLimits },
          };
        } catch (error) {
          if (error instanceof ProviderError && !error.retryable) throw error;
          if (attempt === MAX_ATTEMPTS - 1) {
            throw error instanceof ProviderError ? error : new ProviderError(String(error), false);
          }
          await backoff(attempt);
        } finally {
          clearTimeout(timer);
        }
      }

      throw new ProviderError(
        `Groq rate-limited every attempt: ${rateLimits.join('; ')}. This is a throughput finding, not a bug.`,
        false,
      );
    },
  };
}
