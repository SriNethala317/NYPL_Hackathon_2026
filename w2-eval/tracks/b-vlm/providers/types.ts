/**
 * What every vision provider looks like from the outside.
 *
 * Deliberately narrow: hand it an image and a prompt, get back text and what the call cost. All
 * the JSON repair, schema validation and confidence derivation happen once, above this line, so
 * three providers cannot end up with three subtly different notions of what a valid answer is.
 */

export type VlmCall = {
  /** Raw text the model returned, fences and all. Repair happens upstream. */
  text: string;
  latencyMs: number;
  costUsd: number;
  /** Real token counts from the response, never estimates. `null` where a provider omits them. */
  promptTokens: number | null;
  completionTokens: number | null;
  raw: unknown;
};

export type VlmProvider = {
  readonly name: string;
  /** Where the image goes. `null` only for a provider running on infrastructure you control. */
  readonly sendsImagesTo: string | null;
  isAvailable(): boolean;
  /** Why it is unavailable, for the report's "Not run" section. */
  unavailableReason(): string;
  /**
   * Optional: get the engine ready before timing starts.
   *
   * Only local providers need this. A cold model load billed to the first fixture makes that
   * fixture look slow and every other one look fast, which is a measurement artefact rather than
   * a property of the document.
   */
  warmup?(): Promise<void>;
  extract(imageBase64: string, prompt: string): Promise<VlmCall>;
};

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/**
 * Exponential backoff with jitter.
 *
 * Jitter is not decoration. Without it, a batch that all hits a rate limit at once retries in
 * lockstep and hits it again together — the failure mode the backoff exists to prevent.
 */
export async function backoff(attempt: number, base = 1000): Promise<void> {
  const delay = Math.min(base * 2 ** attempt, 30_000);
  const jittered = delay * (0.5 + Math.random() * 0.5);
  await new Promise((resolve) => setTimeout(resolve, jittered));
}
