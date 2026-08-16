import type { MockUserProfile } from '@/features/eligibility';

export const VALID_NYC_PROFILE: MockUserProfile = {
  id: 'user_001', identity: { firstName: 'Alex', lastName: 'Sharma', dateOfBirth: '1995-06-15' },
  contact: { email: 'alex@example.test', phone: '212-555-0101' }, residence: { street: '10 Example Street', city: 'New York', state: 'NY', zipCode: '10001', borough: 'Manhattan' },
  household: { householdSize: 1, annualIncome: 12_000 }, healthcare: { insuranceEligibility: 'unknown' },
  transportation: { receivesFullCarfare: false, receivesTransportationDiscount: false },
  confirmedFields: ['identity.firstName', 'identity.lastName', 'identity.dateOfBirth', 'residence.street', 'residence.city', 'residence.state', 'residence.zipCode', 'contact.email', 'contact.phone', 'household.householdSize', 'household.annualIncome', 'transportation.receivesFullCarfare', 'transportation.receivesTransportationDiscount'],
};
