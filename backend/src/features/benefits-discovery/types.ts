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
  eligibilityText?: string;
  officialSourceUrl?: string;
  applicationUrl?: string;
  source: { type: 'nyc_dataset' | 'fixture'; lastVerified?: string };
}

export interface SafeRecommendationContext {
  age?: number;
  nycResident?: boolean;
  householdSize?: number;
  annualIncomeBand?: 'under_25k' | '25k_to_50k' | '50k_to_100k' | '100k_plus';
  employmentStatus?: string;
  studentStatus?: boolean;
  hasInsurance?: boolean;
  insuranceEligibility?: 'eligible' | 'not_eligible' | 'unknown';
  transportationNeeds?: boolean;
}

export type BenefitDiscoveryStatus =
  | 'recommended_match'
  | 'possible_match'
  | 'needs_more_information';

export interface GeminiProgramMatch {
  programId: string;
  matchStatus: BenefitDiscoveryStatus;
  relevanceScore: number;
  category?: string;
  reason: string;
  missingInformation?: string[];
}

export type BenefitRecommendationEnhancement = GeminiProgramMatch;

export interface BenefitRecommendation {
  programId: string;
  programCode?: string;
  programName: string;
  discoveryStatus: BenefitDiscoveryStatus;
  relevanceScore?: number;
  category?: string;
  summary?: string;
  whyItMayHelp?: string;
  missingInformation?: string[];
  officialSourceUrl?: string;
  applicationUrl?: string;
  detailedValidationSupported: boolean;
  formAutomationSupported: boolean;
  source: { type: 'nyc_dataset' | 'fixture'; lastVerified?: string };
  discoverySource: 'gemini_catalog_match' | 'catalog_pre_filter' | 'fixture_screening' | 'nyc_screening_api';
  metadataSource: 'live_nyc_dataset' | 'fixture_catalog';
  explanationSource: 'gemini' | 'official_description';
}
