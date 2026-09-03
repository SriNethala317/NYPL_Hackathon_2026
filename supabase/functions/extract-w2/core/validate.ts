import { amountValue, normalizeCode, normalizeYear } from './normalize.ts';
import { AMOUNT_PATTERN, BOX12_CODES, MONETARY_FIELDS, type W2Fields } from './schema.ts';

/**
 * Checking a W-2 against its own arithmetic.
 *
 * These run after every extraction in both tracks and are the single best hallucination and
 * OCR-typo detector available here, because payroll tax is fixed-rate: a misread digit in Box 3
 * breaks its relationship with Box 4 almost every time. No ground truth is needed, so the same
 * checks work in production where there is none.
 *
 * ## A validator never changes a value
 *
 * It lowers that field's confidence and appends a warning. The temptation to "fix" Box 3 when it
 * disagrees with Box 4 is exactly the behaviour the extraction rules forbid, and it is worse here
 * than in a model: a self-correcting pipeline produces a document that is internally consistent
 * and wrong, with nothing left to indicate it was ever in doubt. The job is to flag for human
 * review.
 */

export type Warning = {
  /** Schema path the warning attaches to, or `null` when it concerns the document as a whole. */
  field: string | null;
  code: WarningCode;
  message: string;
};

export type WarningCode =
  | 'ss-tax-mismatch'
  | 'medicare-tax-mismatch'
  | 'ss-wage-base-exceeded'
  | 'ss-tax-ceiling-exceeded'
  | 'ss-wages-below-box1'
  | 'medicare-wages-below-box1'
  | 'bad-amount-format'
  | 'bad-ein-format'
  | 'bad-ssn-format'
  | 'unknown-box12-code'
  | 'unknown-tax-year';

/** Rounding slack, in dollars. Payroll systems round per-period, so cents drift legitimately. */
export const TOLERANCE = 0.02;

export const SS_RATE = 0.062;
export const MEDICARE_RATE = 0.0145;

/**
 * Additional Medicare Tax: 0.9% on wages above the threshold, employee-side only.
 *
 * Without this the Box 5/Box 6 check fires on every high earner — a correctly-read W-2 above the
 * threshold does not satisfy `box6 = box5 × 1.45%`, it satisfies `1.45% + 0.9% on the excess`.
 * Treating that as a misread would flag exactly the households whose income figure matters most.
 */
export const ADDITIONAL_MEDICARE_RATE = 0.009;
export const ADDITIONAL_MEDICARE_THRESHOLD = 200_000;

/** Expected Medicare withholding for a given Medicare wage figure. */
export function expectedMedicareTax(wages: number): number {
  const base = wages * MEDICARE_RATE;
  const excess = Math.max(0, wages - ADDITIONAL_MEDICARE_THRESHOLD);
  return base + excess * ADDITIONAL_MEDICARE_RATE;
}

/**
 * The Social Security wage base, per year.
 *
 * Looked up rather than hardcoded to one figure, because a cap applied from the wrong year turns a
 * correct reading into a warning and vice versa. An unknown year yields no cap check at all — a
 * missing rule is better than a wrong one.
 *
 * Source: SSA annual COLA fact sheets.
 */
export const SS_WAGE_BASE: Record<string, number> = {
  '2019': 132_900,
  '2020': 137_700,
  '2021': 142_800,
  '2022': 147_000,
  '2023': 160_200,
  '2024': 168_600,
  '2025': 176_100,
};

const EIN_PATTERN = /^\d{2}-?\d{7}$/;
const SSN_PATTERN = /^\d{3}-?\d{2}-?\d{4}$/;

/** Runs every check and returns what failed. An empty array means nothing looked wrong. */
export function validate(fields: W2Fields): Warning[] {
  const warnings: Warning[] = [];

  checkAmountFormats(fields, warnings);
  checkIdentifierFormats(fields, warnings);
  checkPayrollArithmetic(fields, warnings);
  checkWageBase(fields, warnings);
  checkWageOrdering(fields, warnings);
  checkBox12Codes(fields, warnings);

  return warnings;
}

/**
 * Every monetary field parses as an amount.
 *
 * Catches an engine returning `"$27,720.00"` or `"27720,00"` despite the prompt, and catches a
 * value like `"see attached"` landing in a money box.
 */
function checkAmountFormats(fields: W2Fields, warnings: Warning[]): void {
  for (const field of MONETARY_FIELDS) {
    const value = fields[field as keyof W2Fields];
    if (typeof value !== 'string' || value === '') continue;
    if (!AMOUNT_PATTERN.test(value)) {
      warnings.push({
        field,
        code: 'bad-amount-format',
        message: `${field} is "${value}", which is not a bare decimal amount.`,
      });
    }
  }

  for (const [index, entry] of fields.box12.entries()) {
    if (entry.amount !== '' && !AMOUNT_PATTERN.test(entry.amount)) {
      warnings.push({
        field: `box12[${index}].amount`,
        code: 'bad-amount-format',
        message: `box12 code ${entry.code} has amount "${entry.amount}", which is not a bare decimal.`,
      });
    }
  }

  for (const [index, item] of fields.state_items.entries()) {
    for (const key of ['state_wages', 'state_tax', 'local_wages', 'local_tax'] as const) {
      const value = item[key];
      if (typeof value !== 'string' || value === '') continue;
      if (!AMOUNT_PATTERN.test(value)) {
        warnings.push({
          field: `state_items[${index}].${key}`,
          code: 'bad-amount-format',
          message: `state_items[${index}].${key} is "${value}", which is not a bare decimal amount.`,
        });
      }
    }
  }
}

function checkIdentifierFormats(fields: W2Fields, warnings: Warning[]): void {
  if (fields.employer_ein && !EIN_PATTERN.test(fields.employer_ein)) {
    warnings.push({
      field: 'employer_ein',
      code: 'bad-ein-format',
      message: 'employer_ein is not two digits, a hyphen, then seven digits.',
    });
  }
  if (fields.employee_ssn && !SSN_PATTERN.test(fields.employee_ssn)) {
    warnings.push({
      field: 'employee_ssn',
      code: 'bad-ssn-format',
      message: 'employee_ssn is not in 3-2-4 digit form.',
    });
  }
}

/**
 * Box 4 should be 6.2% of Box 3, and Box 6 should be 1.45% of Box 5.
 *
 * These are fixed statutory rates, so the check is strong: it fires on a dropped digit, a
 * transposition, or a model that filled one box by deriving it from another and got the rate
 * wrong. Skipped entirely when either side is missing — an absent value is not a disagreement.
 */
function checkPayrollArithmetic(fields: W2Fields, warnings: Warning[]): void {
  const pairs = [
    {
      wages: 'box3_ss_wages',
      tax: 'box4_ss_tax',
      expected: (w: number) => w * SS_RATE,
      describe: '6.2%',
      code: 'ss-tax-mismatch' as const,
      label: 'Social Security',
    },
    {
      wages: 'box5_medicare_wages',
      tax: 'box6_medicare_tax',
      expected: expectedMedicareTax,
      describe: '1.45% (plus 0.9% above 200,000)',
      code: 'medicare-tax-mismatch' as const,
      label: 'Medicare',
    },
  ];

  for (const pair of pairs) {
    const wages = amountValue(fields[pair.wages as keyof W2Fields] as string | null);
    const tax = amountValue(fields[pair.tax as keyof W2Fields] as string | null);
    if (wages === null || tax === null) continue;

    const expected = pair.expected(wages);
    if (Math.abs(expected - tax) > TOLERANCE) {
      warnings.push({
        field: pair.tax,
        code: pair.code,
        message:
          `${pair.label} tax is ${tax.toFixed(2)} but ${pair.describe} of ` +
          `${wages.toFixed(2)} is ${expected.toFixed(2)}.`,
      });
    }
  }
}

/**
 * Box 3 cannot exceed the year's Social Security wage base.
 *
 * This one is a hard ceiling in law rather than a convention, so exceeding it means a misread —
 * usually an extra digit. Requires a recognisable year; an unrecognised one warns separately
 * instead of silently skipping, because a missing year also disables the check.
 */
function checkWageBase(fields: W2Fields, warnings: Warning[]): void {
  const ssWages = amountValue(fields.box3_ss_wages);
  if (ssWages === null) return;

  const year = normalizeYear(fields.tax_year);
  if (year === null || SS_WAGE_BASE[year] === undefined) {
    warnings.push({
      field: 'tax_year',
      code: 'unknown-tax-year',
      message:
        `Cannot check the Social Security wage base: tax_year is ` +
        `${fields.tax_year === null ? 'missing' : `"${fields.tax_year}"`}.`,
    });
    return;
  }

  const cap = SS_WAGE_BASE[year];
  if (cap === undefined) return;

  if (ssWages > cap) {
    warnings.push({
      field: 'box3_ss_wages',
      code: 'ss-wage-base-exceeded',
      message: `box3_ss_wages is ${ssWages.toFixed(2)}, above the ${year} wage base of ${cap}.`,
    });
  }

  /*
   * Box 4 has a hard ceiling that follows from the wage base: 6.2% of the cap and not a cent more.
   * For 2025 that is 10,918.20.
   *
   * This catches a misread that the 6.2% check alone can miss — if Box 3 and Box 4 are BOTH read
   * with the same extra digit, their ratio still holds and only the absolute magnitude betrays it.
   */
  const taxCeiling = cap * SS_RATE;
  const ssTax = amountValue(fields.box4_ss_tax);
  if (ssTax !== null && ssTax > taxCeiling + TOLERANCE) {
    warnings.push({
      field: 'box4_ss_tax',
      code: 'ss-tax-ceiling-exceeded',
      message:
        `box4_ss_tax is ${ssTax.toFixed(2)}, above the ${year} maximum of ` +
        `${taxCeiling.toFixed(2)} (6.2% of the ${cap} wage base).`,
    });
  }
}

/**
 * Boxes 3 and 5 are usually at or above Box 1, because pre-tax deferrals reduce Box 1 and not
 * the others.
 *
 * Common but genuinely not universal — a 401(k) is not the only thing that moves these apart, and
 * an employee over the wage base has Box 3 below Box 1 legitimately. So this warns and never
 * rejects, and it is worth less as evidence than the arithmetic checks above.
 */
function checkWageOrdering(fields: W2Fields, warnings: Warning[]): void {
  const box1 = amountValue(fields.box1_wages);
  if (box1 === null) return;

  const ss = amountValue(fields.box3_ss_wages);
  if (ss !== null && ss < box1 - TOLERANCE) {
    warnings.push({
      field: 'box3_ss_wages',
      code: 'ss-wages-below-box1',
      message: `box3_ss_wages (${ss.toFixed(2)}) is below box1_wages (${box1.toFixed(2)}).`,
    });
  }

  const medicare = amountValue(fields.box5_medicare_wages);
  if (medicare !== null && medicare < box1 - TOLERANCE) {
    warnings.push({
      field: 'box5_medicare_wages',
      code: 'medicare-wages-below-box1',
      message: `box5_medicare_wages (${medicare.toFixed(2)}) is below box1_wages (${box1.toFixed(2)}).`,
    });
  }
}

function checkBox12Codes(fields: W2Fields, warnings: Warning[]): void {
  for (const [index, entry] of fields.box12.entries()) {
    const code = normalizeCode(entry.code);
    if (code === null || !BOX12_CODES.has(code)) {
      warnings.push({
        field: `box12[${index}].code`,
        code: 'unknown-box12-code',
        message: `"${entry.code}" is not an IRS box 12 code.`,
      });
    }
  }
}

/**
 * How much a validator failure should cost a field's confidence.
 *
 * Multiplicative rather than subtractive so a field that was already uncertain does not go
 * negative, and so two independent failures compound. The arithmetic checks bite hardest because
 * they are the ones a correct reading almost never trips.
 */
export const CONFIDENCE_PENALTY: Record<WarningCode, number> = {
  'ss-tax-mismatch': 0.4,
  'medicare-tax-mismatch': 0.4,
  'ss-wage-base-exceeded': 0.3,
  'ss-tax-ceiling-exceeded': 0.3,
  'bad-amount-format': 0.5,
  'bad-ein-format': 0.7,
  'bad-ssn-format': 0.7,
  'unknown-box12-code': 0.6,
  // Common enough legitimately that it is weak evidence of a misread.
  'ss-wages-below-box1': 0.9,
  'medicare-wages-below-box1': 0.9,
  // Says nothing about the field it names; it only records that a check could not run.
  'unknown-tax-year': 1.0,
};

/**
 * Applies validator outcomes to a confidence map.
 *
 * Returns a new map rather than mutating, so a caller can report pre- and post-validation
 * confidence and see how much work the validators actually did.
 */
export function applyPenalties(
  confidence: Record<string, number>,
  warnings: Warning[],
): Record<string, number> {
  const adjusted = { ...confidence };
  for (const warning of warnings) {
    if (warning.field === null) continue;
    const current = adjusted[warning.field];
    if (current === undefined) continue;
    adjusted[warning.field] = current * CONFIDENCE_PENALTY[warning.code];
  }
  return adjusted;
}
