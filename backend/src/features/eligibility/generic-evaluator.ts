import { criteriaFor, incomeLimitFor, programById, programs, type DocumentCategory } from './generic-catalogue';

/**
 * Ported from `src/data/eligibility.ts`'s `evaluate()`/`evaluateAll()` — a port, not a rewrite.
 * The evaluation logic below (including the `partial`/`unchecked` handling) is unchanged from the
 * source. What's dropped: `toVisualStatus()` (maps engine vocabulary to this app's own UI theme
 * tokens — a display concern `backend/` has no equivalent of) and `ageFromDob()`/
 * `monthlyToAnnual()` (parse the Expo app's own MM/DD/YYYY-and-monthly-income form inputs;
 * `backend/`'s `MockUserProfile` already carries ISO dates and annual income, normalized by
 * `normalize-profile.ts`, so those two are dead code here rather than omissions).
 *
 * Status vocabulary is deliberately this app's own, not `backend/`'s original 3-value enum: the
 * worst outcome is `likely_not_eligible`, never `not_eligible` — the app screens, only the agency
 * decides — and `not_screened` exists for programs whose rules are prose that couldn't be parsed,
 * a state the original 3 hardcoded validators never needed because all 3 were hand-written and
 * always scorable.
 */

export type GenericEngineStatus =
  | 'potentially_eligible'
  | 'needs_more_information'
  | 'likely_not_eligible'
  | 'not_screened';

export type GenericProgramSource = { name: string; url: string; lastVerified: string };

export type GenericEligibilityResult = {
  programId: string;
  programName: string;
  status: GenericEngineStatus;
  partial?: boolean;
  unchecked?: string[];
  reasons: string[];
  reasonDetails: { code: string; sourceText?: string; limit?: number }[];
  missingFields: string[];
  source: GenericProgramSource;
};

export type GenericEligibilityInput = {
  age?: number;
  nycResident?: boolean;
  householdSize?: number;
  /** Annual. */
  annualIncome?: number;
  /**
   * Document proof categories already on file. `backend/`'s `MockUserProfile` has no document
   * model at all (confirmed — nothing in its shape tracks uploads), so every real caller in this
   * service passes `[]` here. That's honest, not a bug: it means `requiredCategories` always shows
   * up as missing rather than silently assumed present.
   */
  categoriesOnFile: readonly DocumentCategory[];
};

/** Same guard as the source: `Number("abc")` is `NaN`, not `undefined`, and must not become "1". */
function toCount(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 1) return undefined;
  return Math.trunc(value);
}

function toAmount(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function evaluate(programId: string, input: GenericEligibilityInput): GenericEligibilityResult {
  const program = programById(programId);
  const record = criteriaFor(programId);

  const source: GenericProgramSource = {
    name: program?.name ?? programId,
    url: program?.sourceUrl ?? 'https://data.cityofnewyork.us/d/kvhd-5fmu',
    lastVerified: 'NYC Open Data kvhd-5fmu',
  };

  // No parsed criteria means no opinion. Showing "may not qualify" here would be inventing a
  // rejection out of the parser's own limits.
  if (!record?.scorable) {
    return {
      programId,
      programName: source.name,
      status: 'not_screened',
      reasons: [],
      reasonDetails: [],
      missingFields: [],
      source,
    };
  }

  const { criteria, sources } = record;
  const reasonDetails: GenericEligibilityResult['reasonDetails'] = [];
  const missingFields: string[] = [];

  const householdSize = toCount(input.householdSize);
  const annualIncome = toAmount(input.annualIncome);
  const age = Number.isFinite(input.age as number) ? input.age : undefined;

  const missingCategories = (criteria.requiredCategories ?? []).filter(
    (category) => !input.categoriesOnFile.includes(category),
  );
  missingFields.push(...missingCategories);

  if (criteria.nycResident && input.nycResident === false) {
    reasonDetails.push({ code: 'not-nyc-resident', sourceText: sources.nycResident });
  }

  if (criteria.minAge !== undefined || criteria.maxAge !== undefined) {
    if (age === undefined) missingFields.push('dob');
    else if (criteria.minAge !== undefined && age < criteria.minAge) {
      reasonDetails.push({ code: 'below-min-age', sourceText: sources.age, limit: criteria.minAge });
    } else if (criteria.maxAge !== undefined && age > criteria.maxAge) {
      reasonDetails.push({ code: 'above-max-age', sourceText: sources.age, limit: criteria.maxAge });
    }
  }

  const hasIncomeRule =
    criteria.annualIncomeByHouseholdSize !== undefined || criteria.annualIncomeCap !== undefined;

  if (hasIncomeRule) {
    if (annualIncome === undefined) missingFields.push('income');
    else if (householdSize === undefined && criteria.annualIncomeByHouseholdSize) {
      missingFields.push('household');
    } else {
      const limit = incomeLimitFor(criteria, householdSize ?? 1);
      if (limit !== undefined && annualIncome > limit) {
        reasonDetails.push({ code: 'income-over-limit', sourceText: sources.income, limit });
      }
    }
  }

  /*
   * A partial reading may never produce a negative. See generic-catalogue.ts's `partial` doc for
   * the incident this prevents. Unchanged from the source.
   */
  const failed = reasonDetails.length > 0;
  const status: GenericEngineStatus =
    failed && !record.partial
      ? 'likely_not_eligible'
      : failed || missingFields.length > 0
        ? 'needs_more_information'
        : 'potentially_eligible';

  return {
    programId,
    programName: source.name,
    status,
    partial: record.partial,
    unchecked: record.unchecked,
    reasons: reasonDetails.map((detail) => detail.code),
    reasonDetails,
    missingFields,
    source,
  };
}

/** Screens every program in the catalogue, scorable or not. */
export function evaluateAll(input: GenericEligibilityInput): GenericEligibilityResult[] {
  return programs.map((program) => evaluate(program.id, input));
}
