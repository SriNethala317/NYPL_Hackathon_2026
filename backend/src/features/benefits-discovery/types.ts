export interface BenefitsScreeningInput {
  age?: number;
  nycResident?: boolean;
  householdSize?: number;
  annualIncome?: number;
  employmentStatus?: string;
  studentStatus?: boolean;
  hasInsurance?: boolean;
  insuranceEligibility?: 'eligible' | 'not_eligible' | 'unknown';
  receivesTransportationDiscount?: boolean;
}

export interface ScreeningProgramMatch {
  programCode?: string;
  programName: string;
  needsMoreInformation?: boolean;
}

export interface ScreeningResult {
  matches: ScreeningProgramMatch[];
  sourceType: 'nyc_screening_api' | 'fixture';
}

export interface BenefitProgram {
  programId: string;
  programCode?: string;
  programName: string;
  category?: string;
  description?: string;
  officialSourceUrl?: string;
  applicationUrl?: string;
  source: { type: 'nyc_dataset' | 'fixture'; lastVerified?: string };
}

export interface SafeRecommendationContext {
  nycResident?: boolean;
}

export interface BenefitRecommendationEnhancement {
  programId: string;
  category: string;
  summary: string;
  whyItMayHelp: string;
}

export interface BenefitRecommendation {
  programId: string;
  programCode?: string;
  programName: string;
  discoveryStatus: 'potential_match' | 'needs_more_information';
  category?: string;
  summary?: string;
  whyItMayHelp?: string;
  officialSourceUrl?: string;
  applicationUrl?: string;
  detailedValidationSupported: boolean;
  formAutomationSupported: boolean;
  source: { type: 'nyc_screening_api' | 'nyc_dataset' | 'fixture'; lastVerified?: string };
  discoverySource: 'live_nyc_screening' | 'fixture_screening';
  metadataSource: 'live_nyc_dataset' | 'fixture_catalog';
  explanationSource: 'gemini' | 'official_description';
}
