import { PROGRAM_SOURCES } from '../sources';
import type { EligibilityInput, EligibilityResult, ProgramValidator } from '../types';

export const idnycValidator: ProgramValidator = {
  programId: 'idnyc',
  programName: 'IDNYC',
  validate(input: EligibilityInput): EligibilityResult {
    const reasons: string[] = [];
    const missingFields: string[] = [];
    if (input.nycResident === false) reasons.push('IDNYC is available to New York City residents.');
    else if (input.nycResident === undefined) missingFields.push('nycResident');
    if (input.age === undefined) missingFields.push('age');
    else if (input.age < 10) reasons.push('IDNYC applicants must be at least 10 years old.');

    return {
      programId: 'idnyc',
      programName: 'IDNYC',
      status: reasons.length > 0 ? 'likely_not_eligible' : missingFields.length > 0 ? 'needs_more_information' : 'potentially_eligible',
      reasons,
      missingFields,
      source: PROGRAM_SOURCES.idnyc,
    };
  },
};
