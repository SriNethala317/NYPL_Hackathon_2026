import { amountValue, normalizeCode, normalizeState, normalizeText, valuesAgree } from '../core/normalize.ts';
import {
  EXCLUDED_FROM_SCORING,
  MONETARY_FIELDS,
  SCALAR_FIELDS,
  SCREENER_FIELDS,
  type W2Fields,
} from '../core/schema.ts';

/**
 * Turning two W-2s — what an engine read, and what is actually on the page — into a score.
 *
 * Two things here deliberately depart from the eval spec. Both are recorded in the plan; the
 * reasoning is repeated at the point of departure so nobody has to go looking for it.
 */

export type Outcome =
  | 'correct'
  | 'wrong_under'
  | 'wrong_over'
  | 'wrong'
  | 'missed'
  | 'correct_abstain'
  | 'hallucinated';

export type Tier = 'critical' | 'important' | 'nice';

export type FieldScore = {
  field: string;
  tier: Tier;
  outcome: Outcome;
  expected: string | null;
  actual: string | null;
  confidence: number;
};

/**
 * What each outcome costs.
 *
 * The direction weighting is the spec's and it is right: this product generates a pre-filled
 * application the user reviews and submits themselves, so a false positive is cheap — an extra
 * programme appears, the form is already filled, the user decides. A false negative is expensive
 * and invisible: a programme never appears, and nothing in these metrics would ever show it.
 * Understating income surfaces more programmes; overstating income hides them. Hence
 * `wrong_over` costing more than twice `wrong_under`.
 *
 * `missed` is cheap because a blank field prompts the user to fill it in, and the product
 * deliberately leaves low-confidence fields blank rather than pre-filling them.
 *
 * ## Departure 1: `correct_abstain` scores 0, not +1
 *
 * The spec awards +1. That breaks the metric on a form this sparse. The schema has 22 scalar
 * fields plus array entries, and a real W-2 leaves most of them empty, so an engine returning
 * nothing but nulls collects roughly +25 from abstentions against maybe -15 of misses and comes
 * out **positive**. An engine that reads ten fields correctly and hallucinates three could score
 * below it. The spec's own acceptance test — "a deliberately broken engine returning all-nulls
 * scores as expected" — would pass while meaning the opposite of what it intends.
 *
 * Correct abstention is still tracked and reported as its own count, because knowing an engine
 * abstains well is genuinely useful. It just cannot be allowed to pay for silence.
 */
export const WEIGHTS: Record<Outcome, number> = {
  correct: 1,
  correct_abstain: 0,
  missed: -1,
  wrong_under: -2,
  wrong: -3,
  hallucinated: -4,
  wrong_over: -5,
};

/**
 * Field tiers. Not everything on a W-2 matters equally and a single average hides that.
 *
 * Box 5 is tier one because it is the value that decides which programmes a household is shown.
 * An engine that nails Box 5 and fumbles Box 14 is far more useful than the reverse, and a
 * composite score alone would rank them the same.
 */
export const TIERS: Record<Tier, ReadonlySet<string>> = {
  critical: new Set(['box5_medicare_wages', 'box1_wages', 'box3_ss_wages', 'tax_year']),
  important: new Set([
    'box2_federal_tax',
    'box4_ss_tax',
    'box6_medicare_tax',
    'employer_name',
    'employee_name',
    'box12',
    'state_items',
  ]),
  nice: new Set([
    'box7_ss_tips',
    'box8_allocated_tips',
    'box10_dependent_care',
    'box11_nonqualified',
    'box13_statutory_employee',
    'box13_retirement_plan',
    'box13_third_party_sick',
    'box14_other',
    'employer_address',
    'employee_address',
    'control_number',
    'as_of',
  ]),
};

function tierOf(field: string): Tier {
  const root = field.replace(/\[.*/, '');
  if (TIERS.critical.has(root)) return 'critical';
  if (TIERS.important.has(root)) return 'important';
  return 'nice';
}

/** Presents a value as the string the report should show, whatever its schema type. */
function asText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const text = String(value).trim();
  return text === '' ? null : text;
}

/**
 * Classifies one field.
 *
 * Direction is only meaningful when both sides parse as numbers. A monetary field where one side
 * is prose ("see attached") falls through to `wrong`, because "lower than" is not a claim you can
 * make about a word.
 */
function classify(field: string, expected: string | null, actual: string | null): Outcome {
  if (expected === null && actual === null) return 'correct_abstain';
  if (expected === null) return 'hallucinated';
  if (actual === null) return 'missed';

  const monetary = MONETARY_FIELDS.has(field.replace(/\[.*/, '')) || /_wages|_tax$/.test(field);
  if (valuesAgree(field, expected, actual, monetary)) return 'correct';

  if (monetary) {
    const want = amountValue(expected);
    const got = amountValue(actual);
    if (want !== null && got !== null) return got < want ? 'wrong_under' : 'wrong_over';
  }

  return 'wrong';
}

/**
 * Scores every field of one extraction against one ground truth.
 *
 * ## Departure 2: hallucination is found by walking what the engine emitted
 *
 * The obvious implementation iterates the truth's keys and asks what the engine said for each.
 * That loop is structurally incapable of noticing a field the engine invented, because an
 * invented field has no truth key to iterate. This repo already shipped that mistake: a test at
 * `src/features/extraction/ocr-accuracy.test.ts:136-143` is named "never invents a value it could
 * not read" and asserts `expect(miss).toMatch(/got nothing|got /)` — every miss string is built
 * containing "got ", so the assertion matches unconditionally and the test cannot fail.
 *
 * The fix is to score over the union of both sides. Scalar fields are exhaustive here because the
 * schema is closed, so the union is the schema; the array fields below are where it genuinely
 * matters, since an engine can invent a whole box-12 row.
 */
export type Scope = 'all' | 'screener';

export function scoreExtraction(
  actual: W2Fields,
  truth: W2Fields,
  confidence: Record<string, number>,
  scope: Scope = 'all',
): FieldScore[] {
  const scores: FieldScore[] = [];

  /*
   * `screener` scope drops every field nothing downstream reads.
   *
   * Not a way of flattering the numbers — a way of measuring the thing that decides whether a
   * household is shown a programme. Gemini scores 92% over the full schema and 100% here; qwen
   * scores 47% and 82%. Both differences live entirely in fields the app never consumes, and
   * ranking engines on them ranks them on the wrong thing.
   */
  if (scope === 'screener') {
    for (const field of SCREENER_FIELDS) {
      const expected = asText(truth[field]);
      const got = asText(actual[field]);
      scores.push({
        field,
        tier: tierOf(field),
        outcome: classify(field, expected, got),
        expected,
        actual: got,
        confidence: confidence[field] ?? 0,
      });
    }
    return scores;
  }

  for (const field of SCALAR_FIELDS) {
    if (EXCLUDED_FROM_SCORING.has(field)) continue;
    const expected = asText(truth[field]);
    const got = asText(actual[field]);
    scores.push({
      field,
      tier: tierOf(field),
      outcome: classify(field, expected, got),
      expected,
      actual: got,
      confidence: confidence[field] ?? 0,
    });
  }

  scoreBox12(actual, truth, confidence, scores);
  scoreBox14(actual, truth, confidence, scores);
  scoreStateItems(actual, truth, confidence, scores);

  return scores;
}

/**
 * Box 12 rows, matched by code rather than by position.
 *
 * Position matching would punish an engine that read both rows correctly but in the other order,
 * which is not an error — the boxes are 12a through 12d and carry no meaning in their ordering.
 * A code present in the extraction and absent from truth is a hallucinated row.
 */
function scoreBox12(
  actual: W2Fields,
  truth: W2Fields,
  confidence: Record<string, number>,
  scores: FieldScore[],
): void {
  const truthByCode = new Map(truth.box12.map((e) => [normalizeCode(e.code) ?? e.code, e.amount]));
  const actualByCode = new Map(actual.box12.map((e) => [normalizeCode(e.code) ?? e.code, e.amount]));

  for (const code of new Set([...truthByCode.keys(), ...actualByCode.keys()])) {
    const field = `box12[${code}]`;
    scores.push({
      field,
      tier: 'important',
      outcome: classify(field, truthByCode.get(code) ?? null, actualByCode.get(code) ?? null),
      expected: truthByCode.get(code) ?? null,
      actual: actualByCode.get(code) ?? null,
      confidence: confidence[field] ?? confidence.box12 ?? 0,
    });
  }
}

/** Box 14 rows, matched by normalised label — it is free-text and employers word it differently. */
function scoreBox14(
  actual: W2Fields,
  truth: W2Fields,
  confidence: Record<string, number>,
  scores: FieldScore[],
): void {
  const key = (label: string) => normalizeText(label) ?? label;
  const truthByLabel = new Map(truth.box14_other.map((e) => [key(e.label), e.amount]));
  const actualByLabel = new Map(actual.box14_other.map((e) => [key(e.label), e.amount]));

  for (const label of new Set([...truthByLabel.keys(), ...actualByLabel.keys()])) {
    const field = `box14_other[${label}]`;
    scores.push({
      field,
      tier: 'nice',
      outcome: classify(field, truthByLabel.get(label) ?? null, actualByLabel.get(label) ?? null),
      expected: truthByLabel.get(label) ?? null,
      actual: actualByLabel.get(label) ?? null,
      confidence: confidence[field] ?? confidence.box14_other ?? 0,
    });
  }
}

/**
 * Boxes 15-20, matched by state code.
 *
 * Each column is scored separately rather than the row as a unit, because an engine that reads the
 * state and its wages but misses the local tax has done most of the job, and collapsing that to
 * one wrong row would say otherwise.
 */
function scoreStateItems(
  actual: W2Fields,
  truth: W2Fields,
  confidence: Record<string, number>,
  scores: FieldScore[],
): void {
  const columns = [
    'employer_state_id',
    'state_wages',
    'state_tax',
    'local_wages',
    'local_tax',
    'locality_name',
  ] as const;

  const key = (state: string | null) => normalizeState(state) ?? 'UNKNOWN';
  const truthByState = new Map(truth.state_items.map((i) => [key(i.state), i]));
  const actualByState = new Map(actual.state_items.map((i) => [key(i.state), i]));

  for (const state of new Set([...truthByState.keys(), ...actualByState.keys()])) {
    const want = truthByState.get(state);
    const got = actualByState.get(state);

    for (const column of columns) {
      const expected = asText(want?.[column] ?? null);
      const value = asText(got?.[column] ?? null);
      if (expected === null && value === null) continue; // Absent on both sides is not a data point.

      const field = `state_items[${state}].${column}`;
      scores.push({
        field,
        tier: 'important',
        outcome: classify(field, expected, value),
        expected,
        actual: value,
        confidence: confidence[field] ?? confidence.state_items ?? 0,
      });
    }
  }
}

export type Totals = Record<Outcome, number>;

export function tally(scores: readonly FieldScore[]): Totals {
  const totals: Totals = {
    correct: 0,
    correct_abstain: 0,
    missed: 0,
    wrong_under: 0,
    wrong_over: 0,
    wrong: 0,
    hallucinated: 0,
  };
  for (const score of scores) totals[score.outcome] += 1;
  return totals;
}

export function composite(scores: readonly FieldScore[]): number {
  return scores.reduce((sum, score) => sum + WEIGHTS[score.outcome], 0);
}

/** Accuracy over the fields that had something to read. Abstentions are excluded from both sides. */
export function accuracy(scores: readonly FieldScore[]): number {
  const attempted = scores.filter((s) => s.outcome !== 'correct_abstain');
  if (attempted.length === 0) return 0;
  return attempted.filter((s) => s.outcome === 'correct').length / attempted.length;
}

export function byTier(scores: readonly FieldScore[], tier: Tier): FieldScore[] {
  return scores.filter((score) => score.tier === tier);
}

export const BUCKETS = [
  { label: '0.00-0.25', min: 0, max: 0.25 },
  { label: '0.25-0.50', min: 0.25, max: 0.5 },
  { label: '0.50-0.75', min: 0.5, max: 0.75 },
  { label: '0.75-1.00', min: 0.75, max: 1.01 },
] as const;

/**
 * Accuracy per confidence bucket.
 *
 * This may be the single most decision-relevant number the harness produces. A system at 85%
 * accuracy with well-calibrated confidence is more useful in production than one at 92% whose
 * confidence is uniformly high, because the first can tell a review screen what to highlight and
 * the second cannot.
 *
 * Abstentions are excluded — a field nobody expected and nobody read says nothing about whether
 * the engine knows when it is right.
 */
export function calibration(scores: readonly FieldScore[]): {
  label: string;
  n: number;
  accuracy: number;
}[] {
  const attempted = scores.filter((s) => s.outcome !== 'correct_abstain');
  return BUCKETS.map((bucket) => {
    const inBucket = attempted.filter(
      (s) => s.confidence >= bucket.min && s.confidence < bucket.max,
    );
    const right = inBucket.filter((s) => s.outcome === 'correct').length;
    return {
      label: bucket.label,
      n: inBucket.length,
      accuracy: inBucket.length === 0 ? 0 : right / inBucket.length,
    };
  });
}
