import { normalizeProfileForEligibility } from './normalize-profile';
import { validateProfile } from './profile-validation';
import { fairFaresValidator } from './programs/fair-fares';
import { idnycValidator } from './programs/idnyc';
import { nycCareValidator } from './programs/nyc-care';
import type { EligibilityResult, MockUserProfile } from './types';

const PROGRAM_VALIDATORS = [fairFaresValidator, idnycValidator, nycCareValidator];

/**
 * Validates the profile before deriving minimized eligibility facts. Invalid or incomplete
 * fields are represented in program results rather than causing unrelated programs to fail.
 */
export function checkEligibility(profile: MockUserProfile): EligibilityResult[] {
  validateProfile(profile);
  const input = normalizeProfileForEligibility(profile);
  return PROGRAM_VALIDATORS.map((validator) => validator.validate(input));
}
