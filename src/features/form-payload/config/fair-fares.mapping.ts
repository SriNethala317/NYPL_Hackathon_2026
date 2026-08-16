import type { ProgramFormMapping } from '../types';

export const FAIR_FARES_FORM_MAPPING: ProgramFormMapping = {
  programId: 'fair_fares',
  fields: {
    first_name: 'identity.firstName', last_name: 'identity.lastName', date_of_birth: 'identity.dateOfBirth',
    street_address: 'residence.street', city: 'residence.city', state: 'residence.state', zip_code: 'residence.zipCode',
    email: 'contact.email', phone: 'contact.phone', household_size: 'household.householdSize',
    annual_income: 'household.annualIncome', receives_full_carfare: 'transportation.receivesFullCarfare',
    receives_transportation_discount: 'transportation.receivesTransportationDiscount',
  },
};
