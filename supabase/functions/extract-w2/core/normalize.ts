/**
 * Turning what an engine said into something comparable.
 *
 * Used by the scorer and by Track A's parser, deliberately the same code in both. If ground truth
 * were normalised one way and extractor output another, the score would be partly measuring the
 * difference between two normalisers, and no amount of staring at the report would reveal it.
 *
 * Nothing here is RN-hostile: no `node:` imports, no `Intl` dependence, no regex features Hermes
 * lacks. This file gets lifted into the app alongside the parser.
 */

/**
 * Money to a canonical decimal string, or `null` if there is no number in it.
 *
 * Returning `null` rather than `'0.00'` on digitless input is load-bearing. A field the engine
 * filled with `'N/A'` must score as wrong, not as a correctly-read zero — and zero is a real W-2
 * value, so the two cannot share a representation.
 */
export function normalizeAmount(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;

  // Parentheses are how accounting prints a negative, and some OCR engines preserve them.
  const negative = /^\s*\(.*\)\s*$/.test(value) || value.trim().startsWith('-');
  const digits = value.replace(/[^0-9.]/g, '');
  if (!/\d/.test(digits)) return null;

  // A stray second decimal point ("1,234.56.00") means the read is damaged. Keep the first.
  const firstDot = digits.indexOf('.');
  const cleaned =
    firstDot === -1
      ? digits
      : digits.slice(0, firstDot + 1) + digits.slice(firstDot + 1).replace(/\./g, '');

  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;

  return `${negative && n !== 0 ? '-' : ''}${n.toFixed(2)}`;
}

/** Numeric value of an amount, for direction-aware scoring. `null` when it is not a number. */
export function amountValue(value: string | null | undefined): number | null {
  const normalized = normalizeAmount(value);
  return normalized === null ? null : Number(normalized);
}

/**
 * Names and free text, compared case- and punctuation-insensitively.
 *
 * Unicode letters are kept rather than stripped, so "José García-Piñedo" survives as a name
 * instead of collapsing to "JOSGARCAPIEDO" and failing against its own ground truth.
 */
export function normalizeText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = value
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toUpperCase();
  return cleaned === '' ? null : cleaned;
}

/** SSN and EIN, compared with punctuation removed. Used for format checks, never for scoring. */
export function normalizeIdentifier(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const digits = value.replace(/\D/g, '');
  return digits === '' ? null : digits;
}

/**
 * A state code, so `state_items` rows from two engines can be lined up.
 *
 * Two-letter codes only. A full state name is left as normalised text — mapping "New York" to "NY"
 * here would be inferring a value the engine did not read, which is the one thing every rule in
 * this project forbids.
 */
export function normalizeState(value: string | null | undefined): string | null {
  const text = normalizeText(value);
  if (text === null) return null;
  return text.replace(/\s/g, '');
}

/** A box-12 code: letters only, uppercased. `'d'` and `'D.'` are the same code. */
export function normalizeCode(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const letters = value.replace(/[^A-Za-z]/g, '').toUpperCase();
  return letters === '' ? null : letters;
}

/**
 * Whether two values for a field should be treated as the same answer.
 *
 * Monetary fields compare numerically, so `1234` and `1234.00` agree. Everything else compares as
 * normalised text.
 */
export function valuesAgree(field: string, a: string | null, b: string | null, monetary: boolean): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;

  if (monetary) {
    const left = amountValue(a);
    const right = amountValue(b);
    if (left === null || right === null) return normalizeText(a) === normalizeText(b);
    return left === right;
  }

  if (field === 'employee_ssn' || field === 'employer_ein') {
    return normalizeIdentifier(a) === normalizeIdentifier(b);
  }

  return normalizeText(a) === normalizeText(b);
}

/**
 * A year, as four digits.
 *
 * Engines return this as `2025`, `"2025"`, or occasionally `"Tax year 2025"`. All three mean the
 * same thing and none of them should cost a point.
 */
export function normalizeYear(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const match = String(value).match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : null;
}
