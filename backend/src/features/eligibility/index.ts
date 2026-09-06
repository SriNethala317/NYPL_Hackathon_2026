export { checkEligibility } from './eligibility-engine';
export { normalizeProfileForEligibility } from './normalize-profile';
export { resolveCanonicalProgramId, resolveCanonicalProgramIdForProgram } from './program-id-resolver';
export { validateProfile } from './profile-validation';
export {
  programs,
  programById,
  criteriaFor,
  scorablePrograms,
  initializeCatalogue,
  type DocumentCategory,
  type Program,
  type ProgramCriteria,
  type ProgramCriteriaRecord,
} from './generic-catalogue';
export type {
  EligibilityInput,
  EligibilityResult,
  EligibilityStatus,
  MockUserProfile,
  ProfileValidationResult,
  ProgramSource,
} from './types';
