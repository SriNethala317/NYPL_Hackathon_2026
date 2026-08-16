import { criteriaFor, incomeLimitFor, programById, programs } from './catalogue';

import { documentCategories, type DocumentCategory, type EligibilityStatus as VisualStatus } from '@/theme';

/**
 * Screening a profile against the real NYC criteria.
 *
 * The contract mirrors `checkEligibility()` in `src/features/eligibility` on the validation-system
 * branch, so swapping to that engine — or to the City's live Screening API behind it — is an
 * import change rather than a rewrite of every screen.
 *
 * The vocabulary is deliberate: the worst outcome is `likely_not_eligible`, never
 * `not_eligible`. The app screens; only the agency decides. Every negative carries the City's own
 * sentence that produced it, so a person can see exactly what was applied to them.
 */

export type EngineStatus =
  | 'potentially_eligible'
  | 'needs_more_information'
  | 'likely_not_eligible'
  /** Rules exist only as prose we could not parse. We are not entitled to an opinion. */
  | 'not_screened';

export type ProgramSource = { name: string; url: string; lastVerified: string };

export type EligibilityResult = {
  programId: string;
  programName: string;
  status: EngineStatus;
  /** Machine-readable reason codes; `reasonDetails` carries the quotable text. */
  reasons: string[];
  reasonDetails: { code: string; sourceText?: string; limit?: number }[];
  missingFields: string[];
  source: ProgramSource;
};

export type EligibilityInput = {
  age?: number;
  nycResident?: boolean;
  householdSize?: number;
  /** Annual. The form captures monthly and converts at this boundary. */
  annualIncome?: number;
  categoriesOnFile: readonly DocumentCategory[];
};

/** Engine vocabulary → theme token keys, so styling never learns engine terms. */
export function toVisualStatus(status: EngineStatus): VisualStatus {
  switch (status) {
    case 'potentially_eligible':
      return 'yes';
    case 'needs_more_information':
    case 'not_screened':
      return 'more';
    case 'likely_not_eligible':
      return 'no';
  }
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/** Whole-dollar currency. Cents are noise on an income limit. */
export function formatUsd(amount: number): string {
  return usd.format(amount);
}

/** The form asks for monthly income because applicants think in months; criteria are annual. */
export function monthlyToAnnual(monthly: string | number): number | undefined {
  const n = typeof monthly === 'number' ? monthly : Number(String(monthly).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const annual = n * 12;
  // Guard the multiplication too: a huge input overflows to Infinity, which compares as
  // over every limit and would look like a real determination rather than bad input.
  return Number.isFinite(annual) ? Math.round(annual) : undefined;
}

/**
 * A count that is either a usable positive integer or nothing.
 *
 * `Number("abc")` is `NaN`, which is not `undefined` — so a garbled household field slips past
 * an `=== undefined` check and then `Math.trunc(NaN) || 1` quietly becomes a household of one.
 * That screens a family against the strictest bracket in the table and tells them they do not
 * qualify. Unusable input has to become "unknown", not "one".
 */
export function toCount(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.trunc(n);
}

/** A money amount that is either usable or nothing. Same reasoning as `toCount`. */
export function toAmount(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Years between a MM/DD/YYYY date of birth and today. */
export function ageFromDob(dob: string | undefined): number | undefined {
  if (!dob) return undefined;
  const parts = dob.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!parts) return undefined;
  const [, month, day, year] = parts;
  const birth = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(birth.getTime())) return undefined;

  /*
   * Reject dates that do not exist, rather than letting Date roll them over.
   *
   * `new Date(2000, 12, 1)` is January 2001 and `new Date(2001, 1, 29)` is March 1st — never
   * `Invalid Date`. So "13/01/2000" and an impossible leap day both yield a plausible, silently
   * wrong age that then drives age eligibility. Checking the round-trip is the only way to tell.
   */
  if (
    birth.getFullYear() !== Number(year) ||
    birth.getMonth() !== Number(month) - 1 ||
    birth.getDate() !== Number(day)
  ) {
    return undefined;
  }

  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDelta = now.getMonth() - birth.getMonth();
  // Not had this year's birthday yet.
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : undefined;
}

export function evaluate(programId: string, input: EligibilityInput): EligibilityResult {
  const program = programById(programId);
  const record = criteriaFor(programId);

  const source: ProgramSource = {
    name: program?.name ?? programId,
    url: program?.sourceUrl ?? 'https://data.cityofnewyork.us/d/kvhd-5fmu',
    lastVerified: 'NYC Open Data kvhd-5fmu',
  };

  // No parsed criteria means no opinion. Showing "may not qualify" here would be inventing a
  // rejection out of our own parser's limits.
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
  const reasonDetails: EligibilityResult['reasonDetails'] = [];
  const missingFields: string[] = [];

  // Normalized here rather than trusting the caller: NaN slipping through reads as a real value
  // everywhere downstream, and the failure is silent.
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
    // Judging income against the wrong household size is worse than not judging it at all.
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

  const status: EngineStatus =
    reasonDetails.length > 0
      ? 'likely_not_eligible'
      : missingFields.length > 0
        ? 'needs_more_information'
        : 'potentially_eligible';

  return {
    programId,
    programName: source.name,
    status,
    reasons: reasonDetails.map((detail) => detail.code),
    reasonDetails,
    missingFields,
    source,
  };
}

/** Screens every program in the catalogue, scorable or not. */
export function evaluateAll(input: EligibilityInput): EligibilityResult[] {
  return programs.map((program) => evaluate(program.id, input));
}

/** `missingFields` mixes proof categories and profile fields; the UI renders them differently. */
export function isDocumentCategory(field: string): field is DocumentCategory {
  return (documentCategories as readonly string[]).includes(field);
}
