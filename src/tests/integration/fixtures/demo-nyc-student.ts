import type { MockUserProfile } from '@/features/eligibility';

export const DEMO_NYC_STUDENT_PROFILE: MockUserProfile & { immigration: { sevisId: string; passportNumber: string } } = {
  id: 'demo_nyc_student_001', identity: { firstName: 'Demo', lastName: 'Student', dateOfBirth: '2002-09-01' },
  contact: { email: 'demo.student@example.test', phone: '212-555-0199' }, residence: { street: '99 Fictional Avenue', city: 'New York', state: 'NY', zipCode: '10001', borough: 'Manhattan' },
  household: { householdSize: 1, annualIncome: 12_000 }, healthcare: { insuranceEligibility: 'unknown' }, transportation: { receivesFullCarfare: false, receivesTransportationDiscount: false }, benefits: { employmentStatus: 'student', studentStatus: true },
  confirmedFields: ['identity.firstName', 'identity.lastName', 'identity.dateOfBirth', 'contact.email', 'contact.phone', 'residence.street', 'residence.city', 'residence.state', 'residence.zipCode', 'household.householdSize', 'household.annualIncome', 'transportation.receivesFullCarfare', 'transportation.receivesTransportationDiscount'],
  immigration: { sevisId: 'FAKE-SEVIS-001', passportNumber: 'FAKE-PASSPORT-001' },
};
