/** Official Fair Fares NYC household income limits for 2026, in annual USD. */
export const FAIR_FARES_2026_INCOME_LIMITS: Record<number, number> = {
  1: 23_940,
  2: 32_460,
  3: 40_980,
  4: 49_500,
  5: 58_020,
  6: 66_540,
  7: 75_060,
  8: 83_580,
};

const ADDITIONAL_PERSON_INCREMENT = 8_520;

export function getFairFaresIncomeLimit(householdSize: number): number | undefined {
  if (!Number.isInteger(householdSize) || householdSize < 1) return undefined;
  if (householdSize <= 8) return FAIR_FARES_2026_INCOME_LIMITS[householdSize];
  return FAIR_FARES_2026_INCOME_LIMITS[8] + (householdSize - 8) * ADDITIONAL_PERSON_INCREMENT;
}
