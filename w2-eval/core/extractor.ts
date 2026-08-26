import type { W2Fields } from './schema.ts';

/**
 * What every engine returns, whatever it is underneath.
 *
 * Both tracks implement this and nothing else. The harness knows only this shape, which is what
 * lets a track be developed on its own branch and still be scored by the same scorer.
 */
export interface ExtractionResult {
  fields: W2Fields;

  /**
   * 0-1 per schema path, keyed by field name.
   *
   * Required from both tracks, but the two derive it differently and the report must say so
   * rather than tabling them side by side as if they were the same quantity:
   *
   * - Track A combines OCR word confidence, anchor-match quality, value-format conformance and
   *   validator agreement.
   * - Track B derives it from format conformance and validator agreement, because most vision
   *   APIs expose no logprobs. A model's self-reported legibility is not usable here — this repo
   *   already measured one returning 1.0 for a crisp render and 1.0 for a deliberately blurred
   *   one (`src/features/extraction/gemini-vision.ts:75-88`).
   *
   * Neither is a calibrated probability. Calibration is measured, not assumed.
   */
  fieldConfidence: Record<string, number>;

  latencyMs: number;

  /** 0 for local and free-tier engines; a real estimate from reported token counts otherwise. */
  costUsd: number;

  /** e.g. "track-a:paddle+groq", "track-b:gemini-flash@mid". Identifies a config, not a track. */
  engine: string;

  /** The full upstream response, for debugging and for re-scoring without re-calling. */
  raw: unknown;

  /** Validator failures, retries, truncation, rate limits. Everything that went sideways. */
  warnings: string[];
}

export interface Extractor {
  readonly name: string;
  extract(imagePath: string): Promise<ExtractionResult>;
}

/**
 * The rules that must appear in every LLM and VLM prompt, verbatim.
 *
 * Kept here rather than in each track so the two cannot drift into being prompted differently,
 * which would make the comparison meaningless.
 *
 * The second rule is the one that matters most. A model asked to read a W-2 will happily compute
 * Box 3 from Box 1 or Box 4 from Box 3, because on most forms the arithmetic holds and the answer
 * looks right. When it does not hold — which is exactly when a human needs to see it — a derived
 * value hides the discrepancy behind a plausible number.
 */
export const EXTRACTION_RULES = [
  'Copy digits EXACTLY as they appear. Never compute, infer, derive, or correct a value.',
  'NEVER derive Box 3 from Box 1, or Box 4 from Box 3. If the arithmetic on the form looks wrong, report what is printed anyway.',
  'If a field is not clearly present or not legible, return null. Returning null is correct and expected; guessing is a failure.',
  'Amounts as strings: digits and at most one decimal point. No currency symbols, no thousands separators.',
  'Preserve the document’s own formatting of names and addresses. Do not normalise casing or expand abbreviations.',
  'Return ONLY a JSON object. No prose, no markdown fences.',
] as const;

/**
 * Box 5 is where tuning effort pays off.
 *
 * Downstream it is the value that feeds the benefits screener, and therefore decides which
 * programmes a household is shown. Box 1 excludes 401(k) deferrals and understates gross; Box 3
 * caps at the Social Security wage base. Box 5 excludes only pre-tax health premiums and does not
 * cap, so it is the closest thing on the form to gross income.
 *
 * This does NOT mean an engine should read Box 5 more carefully than the rest — a prompt that
 * says so produces a model that pays less attention elsewhere. It means anchors, thresholds and
 * error analysis are worth spending on Box 5 first.
 */
export const CRITICAL_FIELD = 'box5_medicare_wages';
