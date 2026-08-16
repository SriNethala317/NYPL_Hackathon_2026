import { FAIR_FARES_FORM_MAPPING } from './config/fair-fares.mapping';
import { IDNYC_FORM_MAPPING } from './config/idnyc.mapping';
import { NYC_CARE_FORM_MAPPING } from './config/nyc-care.mapping';
import type { ProgramFormMapping } from './types';

/** Semantic handoff keys, intentionally separate from eligibility rules and browser selectors. */
export const PROGRAM_FORM_MAPPINGS: Record<string, ProgramFormMapping> = {
  fair_fares: FAIR_FARES_FORM_MAPPING,
  idnyc: IDNYC_FORM_MAPPING,
  nyc_care: NYC_CARE_FORM_MAPPING,
};
