import { FAIR_FARES_FORM_MAPPING } from './config/fair-fares.mapping';
import { GENERIC_FORM_MAPPING } from './config/generic.mapping';
import { IDNYC_FORM_MAPPING } from './config/idnyc.mapping';
import { NYC_CARE_FORM_MAPPING } from './config/nyc-care.mapping';
import type { ProgramFormMapping } from './types';

/**
 * Semantic handoff keys, intentionally separate from eligibility rules and browser selectors.
 *
 * Deliberately still just these 3 — do not add a catch-all entry here for every other program.
 * `formAutomationSupported`'s own fix (see benefits-discovery/discover-benefits.ts) checks
 * membership in this exact map to mean "a real, hand-verified mapping exists"; folding the
 * generic fallback in under some other key would quietly make that flag true for everyone again,
 * the same false-advertising shape it was just fixed to stop being. `generate-form-payload.ts`
 * applies `GENERIC_FORM_MAPPING` itself, only when a program has no entry here.
 */
export const PROGRAM_FORM_MAPPINGS: Record<string, ProgramFormMapping> = {
  fair_fares: FAIR_FARES_FORM_MAPPING,
  idnyc: IDNYC_FORM_MAPPING,
  nyc_care: NYC_CARE_FORM_MAPPING,
};

export { GENERIC_FORM_MAPPING };
