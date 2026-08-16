import { generateFormPayload } from '@/features/form-payload';
import { checkEligibility } from '@/features/eligibility';
import { VALID_NYC_PROFILE } from '../eligibility/fixtures/profiles';
export function runFormPayloadScenario(): void { const result = checkEligibility(VALID_NYC_PROFILE).find((item) => item.programId === 'fair_fares'); if (!result || !generateFormPayload(VALID_NYC_PROFILE, 'fair_fares', result).readyForPreview) throw new Error('Form payload scenario failed.'); }
