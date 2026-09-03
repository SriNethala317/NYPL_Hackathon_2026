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
 *
 * ## Model choice matters more here than anywhere else
 *
 * 3.3 GB of weights against 4 GB of VRAM leaves nothing for the vision tower and the KV cache, so
 * `gemma3:4b` spills to CPU and pays for it. A smaller vision model — `qwen3-vl:2b` at 1.9 GB —
 * fits with room to spare and should be markedly faster. Whether it is also less accurate is
 * exactly the sort of question this harness exists to answer, so both are worth running:
 *
 *     --vlm ollama:gemma3:4b
 *     --vlm ollama:qwen3-vl:2b
 */

const DEFAULT_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'gemma3:4b';

/**
 * Fifteen minutes, which sounds absurd until you see the measured numbers.
 *
 * The first version used five minutes and every one of gemma3:4b's runs aborted, which read as
 * "Ollama is not responding" when the model was in fact working the whole time. A timeout shorter
 * than the work turns a slow engine into a broken one, and the report then blames the wrong thing.
 */
const TIMEOUT_MS = 900_000;

type OllamaResponse = {
  response?: string;
  /**
   * Where a reasoning model actually puts its answer.
   *
   * `qwen3-vl:2b` returns an empty `response` and the complete JSON in `thinking`, and it does so
   * even with `think: false`. Reading only `response` made a model that had extracted all nine
   * requested fields perfectly look like it had returned nothing at all.
   */
  thinking?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
  load_duration?: number;
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

    /**
     * Loads the model before the corpus run starts.
     *
     * Cold-loading `qwen3-vl:2b` takes ~35s, and on a card too small to hold it that cost lands on
     * whichever fixture happens to be first — which then looks like the slowest fixture rather than
     * the one that paid for everyone else's startup. Warming up separately keeps the per-document
     * latencies comparable, which is the whole point of measuring them.
     */
    async warmup(): Promise<void> {
      try {
        await fetch(`${url}/api/generate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model, prompt: 'hi', stream: false, options: { num_predict: 1 } }),
        });
      } catch {
        // A failed warm-up is not fatal; the first real call will report the problem properly.
      }
    },

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
          // `response` first, `thinking` when a reasoning model left it empty. See the type above.
          text: (body.response?.trim() ? body.response : (body.thinking ?? '')),
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
