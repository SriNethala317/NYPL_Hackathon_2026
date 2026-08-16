import type { BenefitsScreeningInput, ScreeningResult } from '../types';

export interface BenefitsScreeningProvider {
  screen(input: BenefitsScreeningInput): Promise<ScreeningResult>;
}
