import { documentType, type DocumentTypeId } from '@/data/document-types';

/**
 * Pulling fields out of OCR text, without a model.
 *
 * This is the floor, not the ceiling. A vision model reads a document far better than label
 * matching does — but this path needs no API key, no network, and no per-call cost, so it is what
 * runs when a key is absent and it is what the accuracy test measures against known ground truth.
 *
 * Everything here is label-anchored rather than positional. OCR reorders and re-wraps freely, so
 * "the number in the third box" is meaningless, whereas "the value that follows the words GROSS
 * PAY" survives most of what a phone camera does to a page.
 */

export type ExtractedField = {
  key: string;
  value: string;
  /** 0–1. Label-matched values score higher than values found by shape alone. */
  confidence: number;
};

/** OCR mangles case and spacing; comparisons happen on this form, never the display form. */
function normalizeLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

/** Letters only, uppercased — the form label comparison happens in. */
function letters(value: string): string {
  return value.replace(/[^A-Za-z]/g, '').toUpperCase();
}

/** Levenshtein distance, capped at the length of the longer string. */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const previousDiagonal = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = previousDiagonal;
    }
  }
  return prev[b.length];
}

/**
 * How close a line is to a set of label spellings. Lower is better; `Infinity` means no match.
 *
 * Tesseract turns "CUSTOMER NAME" into "CUSTOMER NAVE" and "ADDRESS" into "hooRESS" on small
 * type, so labels are matched within an edit distance proportional to their length rather than
 * exactly.
 */
function labelScore(line: string, candidates: string[]): { score: number; specificity: number } {
  const seen = letters(line);
  if (!seen) return { score: Infinity, specificity: 0 };

  let best = { score: Infinity, specificity: 0 };
  for (const candidate of candidates) {
    const want = letters(candidate);
    // `specificity` is how much of the label was actually matched. "EMPLOYER NAME" contains
    // "NAME", so it matches the name group perfectly on a short candidate -- the longer match
    // is what tells the two apart.
    const exact = seen.includes(want) ? { score: 0, specificity: want.length } : null;
    if (exact && (exact.score < best.score || exact.specificity > best.specificity)) {
      best = exact;
      continue;
    }

    // Compare only the leading span: labels are often prefixed with a box number.
    const window = seen.slice(0, Math.max(want.length + 3, 6));
    const tolerance = Math.max(1, Math.floor(want.length * 0.25));
    const d = distance(window, want);
    if (d <= tolerance && (d < best.score || (d === best.score && want.length > best.specificity))) {
      best = { score: d, specificity: want.length };
    }
  }
  return best;
}

/**
 * Which label group a line belongs to, if any.
 *
 * Resolved by best score across *all* groups rather than first-match-wins, because "EMPLOYEE" and
 * "EMPLOYER" differ by one character and a tolerant matcher will happily accept either for the
 * other. Asking which is closest gets it right; asking "is this close enough" does not.
 *
 * Memoized per extraction. Every field makes its own pass over the lines, so without a cache the
 * same edit-distance work is repeated once per field — measured at roughly 1ms per line, which is
 * the difference between a snappy extraction and a visibly frozen one.
 */
function bestLabelGroup(line: string, cache: Map<string, keyof typeof LABELS | null>): keyof typeof LABELS | null {
  const cached = cache.get(line);
  if (cached !== undefined) return cached;

  let winner: keyof typeof LABELS | null = null;
  let best = { score: Infinity, specificity: 0 };

  for (const key of Object.keys(LABELS) as (keyof typeof LABELS)[]) {
    const candidate = labelScore(line, LABELS[key]);
    // Closest first; on a tie, the group that matched more of the label wins. Without the
    // tie-break, "EMPLOYER NAME" resolves to the name group because it contains "NAME".
    const better =
      candidate.score < best.score ||
      (candidate.score === best.score && candidate.specificity > best.specificity);
    if (better) {
      best = candidate;
      winner = key;
    }
  }

  const result = best.score === Infinity ? null : winner;
  cache.set(line, result);
  return result;
}

/**
 * The value belonging to a label.
 *
 * Handles both layouts this corpus produces: the value on the same line after a colon, and the
 * value on the line below the label — which is what a boxed form renders as.
 */
function valueForLabel(
  lines: string[],
  group: keyof typeof LABELS,
  cache: Map<string, keyof typeof LABELS | null>,
): { value: string; confidence: number } | null {
  for (let i = 0; i < lines.length; i++) {
    if (bestLabelGroup(lines[i], cache) !== group) continue;

    const sameLine = lines[i].split(/:\s*/).slice(1).join(': ').trim();
    if (sameLine && bestLabelGroup(sameLine, cache) !== group) {
      return { value: sameLine, confidence: 0.9 };
    }

    // Skip blank lines the OCR inserted between a label and its value.
    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
      const next = lines[j];
      if (next && bestLabelGroup(next, cache) !== group) return { value: next, confidence: 0.8 };
    }
  }
  return null;
}

/** First money-shaped token, used only when no label matched. */
function firstAmount(text: string): { value: string; confidence: number } | null {
  const match = text.match(/\b\d{1,3}(?:,\d{3})*\.\d{2}\b|\b\d{3,7}\.\d{2}\b/);
  return match ? { value: match[0], confidence: 0.45 } : null;
}

/**
 * The first money token inside a value.
 *
 * Two boxes side by side ("GROSS PAY | NET PAY") put both amounts on one OCR line. Taking the
 * whole line would produce "2310.00 1902.44", which parses to nothing; taking the first token
 * matches the label we anchored on, since the boxes read left to right.
 */
function amountWithin(value: string): string | null {
  // Comma-grouped form first. Without that ordering, "27720.00" matches the 1-3 digit branch and
  // silently becomes "277" -- an off-by-two-orders-of-magnitude income on a benefits application.
  const match = value.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/);
  return match ? match[0] : null;
}

function firstDate(text: string): { value: string; confidence: number } | null {
  const match = text.match(/\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])[/-](19|20)\d{2}\b/);
  return match ? { value: match[0], confidence: 0.6 } : null;
}

export function normalizeMoney(value: string): string {
  const digits = value.replace(/[^0-9.]/g, '');
  // Text with no digits at all must not become "0.00". On an income field a confident zero reads
  // as "no income", which can wrongly qualify someone -- returning the raw value keeps the
  // failure visible instead.
  if (!/\d/.test(digits)) return value;
  const n = Number(digits);
  return Number.isFinite(n) ? n.toFixed(2) : value;
}

export function normalizeName(value: string): string {
  /*
   * Unicode letters, not just A-Z.
   *
   * Stripping to ASCII turns "José García-Piñedo" into "JOS GARCA-PIEDO" and puts a mangled
   * legal name on a government form. For a New York benefits application that is not a cosmetic
   * defect -- an identity mismatch is grounds for rejection.
   */
  return value
    .replace(/[^\p{L}\p{M}' -]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Label spellings to look for, most specific first.
 *
 * Plain strings rather than regular expressions, because they are compared by edit distance —
 * a regex cannot express "close enough to CUSTOMER NAME".
 */
const LABELS = {
  name: ['employee name', 'customer name', 'account holder', 'employee', 'name'],
  dob: ['date of birth', 'birth date', 'dob'],
  address: ['employee address', 'service address', 'mailing address', 'home address', 'address'],
  employer: ['employer name', 'company name', 'employer'],
  wages: ['wages tips other compensation', 'gross wages', 'annual wages', 'wages'],
  grossPay: ['gross pay', 'gross earnings', 'total gross'],
};

/**
 * Extracts what a given document type is declared to yield.
 *
 * Scoped by document type on purpose: a lease has no employer and a passport has no income, so
 * asking for them invites a false positive from some unrelated number on the page.
 */
/**
 * A ceiling on how much OCR output is worth reading.
 *
 * Real documents are tens of lines. A garbled scan can produce thousands, and at roughly a
 * millisecond of edit-distance work per line that becomes seconds of frozen UI. Labels and their
 * values sit near the top of a form, so truncating loses almost nothing and bounds the worst case.
 */
const MAX_LINES = 300;

export function extractFields(text: string, type: DocumentTypeId): ExtractedField[] {
  const lines = text.split('\n').map(normalizeLine).filter(Boolean).slice(0, MAX_LINES);
  const labelCache = new Map<string, keyof typeof LABELS | null>();
  const fields: ExtractedField[] = [];
  const push = (key: string, hit: { value: string; confidence: number } | null) => {
    if (hit && hit.value) fields.push({ key, value: hit.value, confidence: hit.confidence });
  };

  const declared = new Set<string>(documentType(type).yields);

  if (declared.has('fullName')) push('fullName', valueForLabel(lines, 'name', labelCache));
  if (declared.has('dob')) push('dob', valueForLabel(lines, 'dob', labelCache) ?? firstDate(text));
  if (declared.has('address')) push('address', valueForLabel(lines, 'address', labelCache));

  if (declared.has('income')) {
    const hit =
      valueForLabel(lines, 'grossPay', labelCache) ??
      valueForLabel(lines, 'wages', labelCache) ??
      firstAmount(text);
    if (hit) {
      const amount = amountWithin(hit.value);
      if (amount) push('income', { value: amount, confidence: hit.confidence });
    }
  }

  // Not a profile field, but worth capturing: it is how a pay stub is matched to a W-2 later.
  if (type === 'w2' || type === 'pay_stub') {
    // A pay stub rarely labels the employer -- it is the letterhead. Falling back to the first
    // line is what a person does when reading one, and it is right far more often than not.
    const employer =
      valueForLabel(lines, 'employer', labelCache) ??
      (type === 'pay_stub' && lines[0] ? { value: lines[0], confidence: 0.5 } : null);
    if (employer) {
      fields.push({ key: 'employer', value: employer.value, confidence: employer.confidence });
    }
  }

  return fields.map((field) =>
    field.key === 'income'
      ? { ...field, value: normalizeMoney(field.value) }
      : field.key === 'fullName'
        ? { ...field, value: normalizeName(field.value) }
        : field,
  );
}

/**
 * Whether an extracted value is close enough to the expected one to call correct.
 *
 * OCR routinely returns a trailing period or a doubled space; treating those as failures would
 * understate accuracy, while accepting a wrong digit would overstate it. Money compares
 * numerically, everything else compares on a normalized string.
 */
export function matchesExpected(key: string, actual: string, expected: string): boolean {
  if (key === 'income' || key === 'grossPay' || key === 'annualWages') {
    return Number(normalizeMoney(actual)) === Number(normalizeMoney(expected));
  }
  const clean = (s: string) => s.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return clean(actual) === clean(expected);
}
