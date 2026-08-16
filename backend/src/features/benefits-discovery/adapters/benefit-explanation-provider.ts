import type { BenefitProgram, BenefitRecommendationEnhancement, SafeRecommendationContext } from '../types';

export interface BenefitExplanationProvider {
  enhance(programs: BenefitProgram[], context: SafeRecommendationContext): Promise<BenefitRecommendationEnhancement[]>;
}
