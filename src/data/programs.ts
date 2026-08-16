import type { DocumentKind } from '@/theme';

/**
 * The three programs the design mocks up.
 *
 * Note these are *not* the three in `src/features/eligibility` on the validation-system branch,
 * which covers Fair Fares, IDNYC and NYC Care. When that engine lands it becomes the source of
 * truth and this list goes away — which is why nothing here is referenced by id outside
 * `mock-eligibility.ts`.
 *
 * Income limits are stated **annually**, matching `EligibilityInput.annualIncome`. The design
 * quotes monthly caps ("$2,650/mo") that match no real Fair Fares bracket; the real limits vary
 * by household size, which is what `annualIncomeLimit` takes.
 */

export type ProgramId = 'fair_fares' | 'snap' | 'medicaid';

export type Program = {
  id: ProgramId;
  /** Documents that must be on file before an application can be prefilled. */
  requires: readonly DocumentKind[];
  /** Annual household income cap by household size. */
  annualIncomeLimit: (householdSize: number) => number;
  agency: string;
  benefit: string;
  appliesTo: string;
  /** Where the rules came from and when they were last checked, mirroring ProgramSource. */
  source: { name: string; url: string; lastVerified: string };
};

/** Official Fair Fares NYC limits for 2026, annual USD, by household size. */
const FAIR_FARES_2026: Record<number, number> = {
  1: 23_940,
  2: 32_460,
  3: 40_980,
  4: 49_500,
  5: 58_020,
  6: 66_540,
  7: 75_060,
  8: 83_580,
};
const FAIR_FARES_INCREMENT = 8_520;

function fairFaresLimit(householdSize: number): number {
  const size = Math.max(1, Math.trunc(householdSize) || 1);
  if (size <= 8) return FAIR_FARES_2026[size];
  return FAIR_FARES_2026[8] + (size - 8) * FAIR_FARES_INCREMENT;
}

/** Rough per-person scaling for the two programs the design invents caps for. */
function scaledLimit(base: number, perPerson: number) {
  return (householdSize: number) => {
    const size = Math.max(1, Math.trunc(householdSize) || 1);
    return base + (size - 1) * perPerson;
  };
}

export const programs: readonly Program[] = [
  {
    id: 'fair_fares',
    requires: ['id', 'income'],
    annualIncomeLimit: fairFaresLimit,
    agency: 'NYC Human Resources Administration',
    benefit: '50% off subway and bus fares',
    appliesTo: 'NYC residents ages 18–64',
    source: {
      name: 'Fair Fares NYC',
      url: 'https://www.nyc.gov/site/fairfares/',
      lastVerified: '2026-08-15',
    },
  },
  {
    id: 'snap',
    requires: ['id', 'income', 'address'],
    annualIncomeLimit: scaledLimit(23_000, 8_100),
    agency: 'NYS Office of Temporary and Disability Assistance',
    benefit: 'Monthly grocery money on an EBT card',
    appliesTo: 'Households under the gross income limit',
    source: {
      name: 'SNAP (OTDA)',
      url: 'https://otda.ny.gov/programs/snap/',
      lastVerified: '2026-08-15',
    },
  },
  {
    id: 'medicaid',
    requires: ['id', 'income'],
    annualIncomeLimit: scaledLimit(21_600, 7_600),
    agency: 'NYS Department of Health',
    benefit: 'Free or low-cost health coverage',
    appliesTo: 'NY residents under the income limit',
    source: {
      name: 'NY State of Health',
      url: 'https://nystateofhealth.ny.gov/',
      lastVerified: '2026-08-15',
    },
  },
] as const;

export function programById(id: ProgramId): Program {
  const program = programs.find((p) => p.id === id);
  if (!program) throw new Error(`Unknown program: ${id}`);
  return program;
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function formatUsd(amount: number): string {
  return usd.format(amount);
}
