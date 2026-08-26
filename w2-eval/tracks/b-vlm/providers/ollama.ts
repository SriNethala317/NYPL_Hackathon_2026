import { ProviderError, type VlmCall, type VlmProvider } from './types.ts';

/**
 * A multimodal model running on your own machine.
 *
 * Disproportionately interesting even if it scores lowest, because it is the only engine in this
 * whole comparison where a real document could be processed safely — nothing leaves infrastructure
 * you control. It is also unmetered, which makes it the sane choice for iterating on prompts
 * without burning a free tier.
 *
 * Expo Go reaches it the same way it reaches anything else: a `fetch` to the desktop's LAN address.
 * `localhost` works for the harness and will never work from a phone.
 *
 * ## Measured on a GTX 1650 (4 GB) with gemma3:4b
 *
 * 8.8 output tokens/sec. A 20-field prompt returned 252 tokens in 28.5s warm; the full schema lands
 * around 60-90s per document. The model is 3.3 GB against 4 GB of VRAM, so the vision tower and KV
 * cache spill to CPU and it is unlikely to be faster than this without a bigger card.
 *
 * On the *clean* fixture it read `2720.00` where the form says `27720.00` and
 * `ATLAS CARE INC` where the form says `ATLAS HOME CARE INC` — a dropped digit and a dropped word
 * on the easiest image in the corpus. That is not a reason to exclude it, it is the finding. But it
 * is why the runner defaults this provider to one resolution instead of sweeping three: an hour of
 * wall-clock to confirm a result this clear is not a good trade.
 */

const DEFAULT_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'gemma3:4b';

/** Generous because it has to be: see the measured throughput above. */
const TIMEOUT_MS = 300_000;

type OllamaResponse = {
  response?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
  error?: string;
};

export function createOllama(model = DEFAULT_MODEL): VlmProvider {
  const url = (process.env.OLLAMA_URL ?? DEFAULT_URL).replace(/\/$/, '');

  return {
    name: `ollama:${model}`,
    // Runs on hardware you own. This is the entire argument for keeping it in the comparison.
    sendsImagesTo: null,

    // Cheap to assume present: a connection failure below reports itself clearly enough, and
    // probing the daemon on every construction would slow the runner's startup for nothing.
    isAvailable: () => true,
    unavailableReason: () => `Ollama did not respond at ${url}. Is \`ollama serve\` running?`,

    async extract(imageBase64: string, prompt: string): Promise<VlmCall> {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const response = await fetch(`${url}/api/generate`, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            prompt,
            images: [imageBase64],
            stream: false,
            format: 'json',
            options: { temperature: 0 },
          }),
        });

        if (!response.ok) {
          const detail = (await response.text()).slice(0, 300);
          throw new ProviderError(
            `Ollama returned ${response.status}: ${detail}`,
            response.status >= 500,
            response.status,
          );
        }

        const body = (await response.json()) as OllamaResponse;
        if (body.error) throw new ProviderError(`Ollama: ${body.error}`, false);

        return {
          text: body.response ?? '',
          // Ollama's own timing, which excludes the HTTP round trip on localhost.
          latencyMs: body.total_duration ? Math.round(body.total_duration / 1e6) : Date.now() - started,
          costUsd: 0,
          promptTokens: body.prompt_eval_count ?? null,
          completionTokens: body.eval_count ?? null,
          raw: body,
        };
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw new ProviderError(
          `Ollama at ${url} did not respond: ${String(error)}. Is \`ollama serve\` running?`,
          false,
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
