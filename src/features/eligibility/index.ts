export { checkEligibility } from './eligibility-engine';
export { normalizeProfileForEligibility } from './normalize-profile';
export { validateProfile } from './profile-validation';
export { PROGRAM_SOURCES } from './sources';
export { getFairFaresIncomeLimit, FAIR_FARES_2026_INCOME_LIMITS } from './programs/fair-fares-limits';
export type {
  EligibilityInput,
  EligibilityResult,
  EligibilityStatus,
  MockUserProfile,
  ProfileValidationResult,
  ProgramSource,
  ProgramValidator,
} from './types';
