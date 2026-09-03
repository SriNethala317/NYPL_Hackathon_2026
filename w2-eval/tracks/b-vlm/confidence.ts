import { AMOUNT_PATTERN, BOX12_CODES, MONETARY_FIELDS, SCALAR_FIELDS, type W2Fields } from '../../core/schema.ts';
import { normalizeCode, normalizeYear } from '../../core/normalize.ts';
import { applyPenalties, validate } from '../../core/validate.ts';

/**
 * Deriving a per-field confidence for a track that is given none.
 *
 * Vision APIs do not expose logprobs, and a model's self-reported certainty is worthless here —
 * the app measured Gemini returning `1.0` for a crisp render and `1.0` for a deliberately blurred
 * one (`src/features/extraction/gemini-vision.ts:75-88`). So confidence is inferred from
 * properties of the answer rather than asked for.
 *
 * Three signals, in increasing order of how much they tell you:
 *
 * 1. **Presence.** A null is not a low-confidence value, it is an abstention, and it gets 0.
 * 2. **Format conformance.** A monetary field that does not parse as an amount, a box-12 code the
 *    IRS does not define, a year that is not four digits — each says the read is damaged.
 * 3. **Validator agreement.** The strongest signal available, because payroll tax is fixed-rate: a
 *    misread digit in Box 3 breaks its relationship with Box 4 nearly every time.
 *
 * **This is not the same quantity Track A produces**, and the report says so rather than tabling
 * them side by side. Track A can see how confident the OCR engine was about each character and how
 * cleanly an anchor matched; this track is reasoning backwards from the shape of the answer. Both
 * are useful, neither is a probability, and comparing their calibration curves directly would
 * imply a common scale that does not exist.
 */

/** A field that parsed cleanly and broke no validator. Deliberately short of certainty. */
const CLEAN = 0.85;

/** A field present and well-formed, but on a document whose arithmetic did not check out. */
const UNCHECKED = 0.7;

export function deriveConfidence(fields: W2Fields): Record<string, number> {
  const confidence: Record<string, number> = {};

  for (const field of SCALAR_FIELDS) {
    const value = fields[field];
    if (value === null || value === undefined) {
      confidence[field] = 0;
      continue;
    }

    if (MONETARY_FIELDS.has(field)) {
      confidence[field] = AMOUNT_PATTERN.test(String(value)) ? CLEAN : 0.25;
      continue;
    }

    if (field === 'tax_year') {
      confidence[field] = normalizeYear(String(value)) === null ? 0.25 : CLEAN;
      continue;
    }

    confidence[field] = CLEAN;
  }

  for (const entry of fields.box12) {
    const code = normalizeCode(entry.code);
    const known = code !== null && BOX12_CODES.has(code);
    const wellFormed = AMOUNT_PATTERN.test(entry.amount);
    confidence[`box12[${code ?? entry.code}]`] = known && wellFormed ? CLEAN : 0.3;
  }

  for (const entry of fields.box14_other) {
    confidence[`box14_other[${entry.label}]`] = AMOUNT_PATTERN.test(entry.amount) ? UNCHECKED : 0.3;
  }

  for (const item of fields.state_items) {
    const state = item.state ?? 'UNKNOWN';
    for (const column of ['employer_state_id', 'state_wages', 'state_tax', 'local_wages', 'local_tax', 'locality_name'] as const) {
      const value = item[column];
      if (value === null) continue;
      const monetary = column.endsWith('_wages') || column.endsWith('_tax');
      confidence[`state_items[${state}].${column}`] =
        monetary && !AMOUNT_PATTERN.test(value) ? 0.25 : UNCHECKED;
    }
  }

  // The validators get the last word, because they are the only signal here that can catch a
  // value which is perfectly well-formed and simply wrong.
  return applyPenalties(confidence, validate(fields));
}

/**
 * Marks fields two runs disagreed on as low confidence.
 *
 * A genuine signal — a model that returns the same digits twice at temperature 0 is more likely to
 * have read them than guessed them — but it doubles cost, so it is behind `--self-consistency` and
 * its effect is reported separately rather than folded into the headline numbers.
 */
export function applySelfConsistency(
  confidence: Record<string, number>,
  first: W2Fields,
  second: W2Fields,
): { confidence: Record<string, number>; disagreements: string[] } {
  const adjusted = { ...confidence };
  const disagreements: string[] = [];

  for (const field of SCALAR_FIELDS) {
    if (first[field] === second[field]) continue;
    disagreements.push(field);
    adjusted[field] = Math.min(adjusted[field] ?? 0, 0.2);
  }

  return { confidence: adjusted, disagreements };
}
