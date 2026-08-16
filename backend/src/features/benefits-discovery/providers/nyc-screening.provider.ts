import { BENEFITS_CONFIG } from '@/config/benefits.config';
import type { BenefitsScreeningProvider } from '../adapters/benefits-screening-provider';
import type { BenefitsScreeningInput, ScreeningResult } from '../types';

export class LiveScreeningUnavailableError extends Error {}

/** Credential-gated adapter. Endpoint and token are supplied only after NYC API onboarding. */
export class NycScreeningProvider implements BenefitsScreeningProvider {
  async screen(_input: BenefitsScreeningInput): Promise<ScreeningResult> {
    if (!BENEFITS_CONFIG.screeningApi.endpoint) {
      throw new LiveScreeningUnavailableError('NYC Screening API endpoint and token require account onboarding.');
    }
    throw new LiveScreeningUnavailableError('Live request mapping is enabled after the NYC account supplies its documented request contract.');
  }
}
