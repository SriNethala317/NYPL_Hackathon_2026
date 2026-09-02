import { z } from 'zod';

/**
 * The one schema both tracks emit.
 *
 * Neither track may extend this for its own convenience. The whole point of the bake-off is that
 * an OCR-plus-parser pipeline and a vision model are scored on identical output, so any field one
 * track can express and the other cannot would quietly decide the result.
 *
 * ## Why every monetary value is a string
 *
 * Three reasons, all of which matter:
 *
 * 1. No float rounding. `1234.10` must round-trip exactly, and it does not survive an IEEE double
 *    intact.
 * 2. You can see precisely what the engine read, including a misplaced decimal. `2720.00` against
 *    a truth of `27720.00` is a dropped digit; as a number it is just a smaller number.
 * 3. Comparison against ground truth is exact rather than approximate.
 *
 * Conversion to `numeric` happens at the database boundary, which is out of scope here.
 *
 * Format: digits and at most one decimal point. No `$`, no thousands separators, no parentheses.
 * Negative values take a leading `-`. Engines will not honour this on their own — `repair.ts`
 * coerces before this schema ever sees the payload.
 */

/** Digits, optional leading `-`, at most two decimal places. */
export const AMOUNT_PATTERN = /^-?\d+(\.\d{1,2})?$/;

/**
 * Box 12 codes the IRS actually defines.
 *
 * A code outside this set is a misread far more often than it is a real value — `0` for `D`, `8`
 * for `B`. The validator warns rather than rejecting, because the job here is to flag for human
 * review, not to silently correct somebody's tax document.
 */
export const BOX12_CODES = new Set([
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N',
  'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'Y', 'Z',
  'AA', 'BB', 'DD', 'EE', 'FF', 'GG', 'HH', 'II',
]);

export const Box12Entry = z.object({
  code: z.string(),
  amount: z.string(),
});

export const Box14Entry = z.object({
  label: z.string(),
  amount: z.string(),
});

/** Boxes 15-20, which repeat once per state or locality. */
export const StateItem = z.object({
  state: z.string().nullable(),
  employer_state_id: z.string().nullable(),
  state_wages: z.string().nullable(),
  state_tax: z.string().nullable(),
  local_wages: z.string().nullable(),
  local_tax: z.string().nullable(),
  locality_name: z.string().nullable(),
});

export const W2Fields = z.object({
  /*
   * Identity.
   *
   * `employee_ssn` and `employer_ein` stay in the schema deliberately. An engine will read them
   * whether or not we ask, and omitting the keys produces confusing nulls that look like
   * extraction failures. What they must never do is escape: both are excluded from scoring and
   * asserted absent from every written artefact. See `redactForOutput` below.
   */
  employee_ssn: z.string().nullable(),
  employer_ein: z.string().nullable(),
  employer_name: z.string().nullable(),
  employer_address: z.string().nullable(),
  employee_name: z.string().nullable(),
  employee_address: z.string().nullable(),
  control_number: z.string().nullable(),

  // Numbered boxes 1-11. Box 9 has been unused by the IRS since 2011 and is not on the form.
  box1_wages: z.string().nullable(),
  box2_federal_tax: z.string().nullable(),
  box3_ss_wages: z.string().nullable(),
  box4_ss_tax: z.string().nullable(),
  box5_medicare_wages: z.string().nullable(),
  box6_medicare_tax: z.string().nullable(),
  box7_ss_tips: z.string().nullable(),
  box8_allocated_tips: z.string().nullable(),
  box10_dependent_care: z.string().nullable(),
  box11_nonqualified: z.string().nullable(),

  box12: z.array(Box12Entry).default([]),

  box13_statutory_employee: z.boolean().nullable(),
  box13_retirement_plan: z.boolean().nullable(),
  box13_third_party_sick: z.boolean().nullable(),

  box14_other: z.array(Box14Entry).default([]),

  state_items: z.array(StateItem).default([]),

  tax_year: z.string().nullable(),

  /*
   * The date this document speaks to — not the date it was uploaded.
   *
   * For a W-2 it derives from `tax_year`. Nothing consumes it in this phase; it exists because a
   * document store that cannot say how old a fact is has to be migrated to add it later, and that
   * migration is painful once there are rows.
   */
  as_of: z.string().nullable(),
});

export type W2Fields = z.infer<typeof W2Fields>;
export type Box12Entry = z.infer<typeof Box12Entry>;
export type Box14Entry = z.infer<typeof Box14Entry>;
export type StateItem = z.infer<typeof StateItem>;

/** Every scalar field path, in the order a report should present them. */
export const SCALAR_FIELDS = [
  'employee_ssn',
  'employer_ein',
  'employer_name',
  'employer_address',
  'employee_name',
  'employee_address',
  'control_number',
  'box1_wages',
  'box2_federal_tax',
  'box3_ss_wages',
  'box4_ss_tax',
  'box5_medicare_wages',
  'box6_medicare_tax',
  'box7_ss_tips',
  'box8_allocated_tips',
  'box10_dependent_care',
  'box11_nonqualified',
  'box13_statutory_employee',
  'box13_retirement_plan',
  'box13_third_party_sick',
  'tax_year',
  'as_of',
] as const satisfies readonly (keyof W2Fields)[];

export type ScalarField = (typeof SCALAR_FIELDS)[number];

/** Fields holding money, for format validation and for direction-aware scoring. */
export const MONETARY_FIELDS = new Set<string>([
  'box1_wages',
  'box2_federal_tax',
  'box3_ss_wages',
  'box4_ss_tax',
  'box5_medicare_wages',
  'box6_medicare_tax',
  'box7_ss_tips',
  'box8_allocated_tips',
  'box10_dependent_care',
  'box11_nonqualified',
]);

/**
 * The only fields the NYC benefits screener can take from a W-2.
 *
 * `EligibilityInput` (`src/data/eligibility.ts:41-48`) accepts age, NYC residency, household size
 * and annual income. A W-2 carries no date of birth and no household size, so it can supply
 * exactly two of those — income, and residency via the employee's address — plus the name that
 * ties the document to a person and the year that says how stale the income figure is.
 *
 * Everything else in `W2Fields` is kept for the record and consumed by nothing.
 *
 * ## Why this list is short on purpose
 *
 * Measured, same model and same image: a 9-field prompt returned 9 of 9 correct; the full ~40-field
 * schema returned 68% on the same page and invented a box-12 row whose code was the section header
 * "13". Asking for less is not a compromise here — it is the single largest accuracy lever found.
 */
export const SCREENER_FIELDS = [
  'box5_medicare_wages',
  'box1_wages',
  'employee_address',
  'employee_name',
  'tax_year',
] as const satisfies readonly (keyof W2Fields)[];

export type ScreenerField = (typeof SCREENER_FIELDS)[number];

/**
 * Box 5 is the income figure, with Box 1 as the fallback.
 *
 * Box 1 excludes 401(k) deferrals and understates gross; Box 3 caps at the Social Security wage
 * base. Box 5 excludes only pre-tax health premiums and does not cap, so it is the closest thing
 * on the form to the gross income a screener means.
 *
 * **The result is ANNUAL.** The app's `income` profile field is documented as gross *monthly*
 * (`src/data/profile-fields.ts:85`) and is multiplied by 12 at the eligibility boundary
 * (`src/data/eligibility.ts:75-82`). Writing this through unconverted overstates income twelvefold,
 * pushes a household over every cap, and silently hides the programmes they qualify for — the
 * failure this project weights at -5 precisely because nothing downstream would ever reveal it.
 */
export function annualIncomeFrom(fields: W2Fields): string | null {
  return fields.box5_medicare_wages ?? fields.box1_wages;
}

/**
 * Never scored, never written out.
 *
 * The screening step downstream determines eligibility from household composition, age, income and
 * living situation — there is no field on it for either of these, so carrying them past extraction
 * buys nothing and costs everything if it leaks.
 */
export const EXCLUDED_FROM_SCORING = new Set<string>(['employee_ssn', 'employer_ein']);

/**
 * An empty document, for the "engine failed entirely" path.
 *
 * Both tracks are required to return a valid `ExtractionResult` rather than throw, and this is what
 * they return. It is also the stub the harness scores to prove the scorer is not rewarding silence.
 */
export function emptyFields(): W2Fields {
  return W2Fields.parse({
    employee_ssn: null,
    employer_ein: null,
    employer_name: null,
    employer_address: null,
    employee_name: null,
    employee_address: null,
    control_number: null,
    box1_wages: null,
    box2_federal_tax: null,
    box3_ss_wages: null,
    box4_ss_tax: null,
    box5_medicare_wages: null,
    box6_medicare_tax: null,
    box7_ss_tips: null,
    box8_allocated_tips: null,
    box10_dependent_care: null,
    box11_nonqualified: null,
    box12: [],
    box13_statutory_employee: null,
    box13_retirement_plan: null,
    box13_third_party_sick: null,
    box14_other: [],
    state_items: [],
    tax_year: null,
    as_of: null,
  });
}

/**
 * Strips the identifiers that must not reach disk.
 *
 * Called on every payload before it is serialised, by the harness rather than by each track — a
 * boundary that each engine has to remember to honour is not a boundary. A test asserts no written
 * artefact contains either value.
 */
export function redactForOutput(fields: W2Fields): W2Fields {
  return { ...fields, employee_ssn: null, employer_ein: null };
}
