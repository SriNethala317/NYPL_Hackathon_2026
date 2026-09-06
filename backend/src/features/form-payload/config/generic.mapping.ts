import type { ProgramFormMapping } from '../types';

/**
 * The fields genuinely common to all 3 hand-verified mappings (`fair-fares.mapping.ts`,
 * `idnyc.mapping.ts`, `nyc-care.mapping.ts`) — checked field by field, not assumed:
 *
 *   first_name, last_name, date_of_birth, street_address, city, state, zip_code, email, phone
 *
 * That's the real 3-way intersection: identity + residence + contact, 9 fields. `household_size`
 * and `annual_income` are NOT in it — Fair Fares and NYC Care both have them, but IDNYC's real
 * mapping (a municipal ID card application) has neither, since it has no income test. Including
 * them here would mean claiming something proven for 2 of 3 mappings as proven for all 3, which
 * is exactly the kind of overclaim this fallback exists to avoid — so this mapping is the strict
 * 9-field core, not the 11-field superset a looser reading of "the common fields" might suggest.
 *
 * This is a reasonable default for a program never individually reviewed, not a verified mapping
 * for any specific one of them — no PDF or real application form was read to build this, unlike
 * the 3 program-specific mappings. `generate-form-payload.ts` falls back to it only when a program
 * has no entry in `PROGRAM_FORM_MAPPINGS`; `FormFillPayload.mappingSource` tells the caller which
 * kind of mapping actually produced a given payload.
 */
export const GENERIC_FORM_MAPPING: ProgramFormMapping = {
  programId: 'generic',
  fields: {
    first_name: 'identity.firstName',
    last_name: 'identity.lastName',
    date_of_birth: 'identity.dateOfBirth',
    street_address: 'residence.street',
    city: 'residence.city',
    state: 'residence.state',
    zip_code: 'residence.zipCode',
    email: 'contact.email',
    phone: 'contact.phone',
  },
};
