/** Canonical profile boundary for the app's mock-auth or future profile provider. */
export interface MockUserProfile {
  id: string;
  identity?: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
  };
  contact?: {
    email?: string;
    phone?: string;
  };
  residence?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    borough?: string;
  };
  household?: {
    householdSize?: number;
    annualIncome?: number;
  };
  healthcare?: {
    hasInsurance?: boolean;
    insuranceEligibility?: 'eligible' | 'not_eligible' | 'unknown';
    /** Result of an affordability screening; this engine does not calculate it. */
    canAffordInsurance?: boolean;
  };
  transportation?: {
    receivesTransportationDiscount?: boolean;
    receivesFullCarfare?: boolean;
    fairFaresDiscountType?: 'subway_bus' | 'access_a_ride';
  };
  benefits?: {
    employmentStatus?: string;
    studentStatus?: boolean;
  };
  /** Source paths the user has reviewed and confirmed for use in a form. */
  confirmedFields?: string[];
}

export interface EligibilityInput {
  age?: number;
  nycResident?: boolean;
  householdSize?: number;
  annualIncome?: number;
  hasInsurance?: boolean;
  insuranceEligibility?: 'eligible' | 'not_eligible' | 'unknown';
  canAffordInsurance?: boolean;
  receivesTransportationDiscount?: boolean;
  receivesFullCarfare?: boolean;
  fairFaresDiscountType?: 'subway_bus' | 'access_a_ride';
}

export type EligibilityStatus =
  | 'potentially_eligible'
  | 'needs_more_information'
  | 'likely_not_eligible';

export interface ProgramSource {
  name: string;
  url: string;
  lastVerified: string;
}

export interface EligibilityResult {
  programId: string;
  programName: string;
  status: EligibilityStatus;
  /**
   * True when the underlying rule is only a fragment of the real test (an OR-condition the
   * parser could only capture part of, or a condition the engine never asks about) — see
   * `generic-catalogue.ts`'s `ProgramCriteriaRecord.partial` doc for the incident this exists to
   * prevent. Present for every program the generic evaluator scores; absent for the pre-existing
   * fixture-only programs that never carried this field.
   */
  partial?: boolean;
  /** Named conditions the engine cannot evaluate for this program, e.g. disability status. */
  unchecked?: string[];
  reasons: string[];
  missingFields: string[];
  source: ProgramSource;
}

export interface ProfileValidationResult {
  isValid: boolean;
  issues: string[];
}
