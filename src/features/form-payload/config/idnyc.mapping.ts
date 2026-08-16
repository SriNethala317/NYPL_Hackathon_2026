import type { ProgramFormMapping } from '../types';

export const IDNYC_FORM_MAPPING: ProgramFormMapping = {
  programId: 'idnyc',
  fields: {
    first_name: 'identity.firstName', last_name: 'identity.lastName', date_of_birth: 'identity.dateOfBirth',
    street_address: 'residence.street', city: 'residence.city', state: 'residence.state', zip_code: 'residence.zipCode',
    email: 'contact.email', phone: 'contact.phone',
  },
};
