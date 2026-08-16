import type { ProgramFormMapping } from '../types';

export const NYC_CARE_FORM_MAPPING: ProgramFormMapping = {
  programId: 'nyc_care',
  fields: {
    first_name: 'identity.firstName', last_name: 'identity.lastName', date_of_birth: 'identity.dateOfBirth',
    street_address: 'residence.street', city: 'residence.city', state: 'residence.state', zip_code: 'residence.zipCode',
    email: 'contact.email', phone: 'contact.phone', household_size: 'household.householdSize',
    annual_income: 'household.annualIncome', insurance_eligibility: 'healthcare.insuranceEligibility',
    can_afford_insurance: 'healthcare.canAffordInsurance',
  },
};
