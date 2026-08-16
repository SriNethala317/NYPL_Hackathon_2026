import { discoverBenefits, toBenefitsScreeningInput } from '@/features/benefits-discovery';
import { checkEligibility } from '@/features/eligibility';
import { generateFormPayload } from '@/features/form-payload';
import { buildGeminiEnhancementRequest } from '@/features/benefits-discovery/providers/gemini-benefit-explanation.provider';
import { DEMO_NYC_STUDENT_PROFILE } from './fixtures/demo-nyc-student';

const FORBIDDEN = ['firstName', 'lastName', 'email', 'phone', 'street', 'dateOfBirth', 'sevisId', 'passportNumber'];
function assertNoPii(value: unknown): void { const serialized = JSON.stringify(value); for (const key of FORBIDDEN) if (serialized.includes(`"${key}"`)) throw new Error(`PII key leaked: ${key}`); }

export async function runEndToEndScenario() {
  const screeningInput = toBenefitsScreeningInput(DEMO_NYC_STUDENT_PROFILE); assertNoPii(screeningInput);
  const recommendations = await discoverBenefits(DEMO_NYC_STUDENT_PROFILE);
  if (recommendations.length <= 3 || !recommendations.some((item) => !item.detailedValidationSupported)) throw new Error('Broad discovery contract failed.');
  const selected = recommendations.find((item) => item.programId === 'fair_fares'); if (!selected?.detailedValidationSupported || !selected.formAutomationSupported) throw new Error('Fair Fares capability contract failed.');
  const detailedResult = checkEligibility(DEMO_NYC_STUDENT_PROFILE).find((item) => item.programId === selected.programId); if (!detailedResult) throw new Error('Detailed result missing.');
  const payload = generateFormPayload(DEMO_NYC_STUDENT_PROFILE, selected.programId, detailedResult);
  if (!payload.applicantId || !payload.readyForPreview || !payload.fields.first_name?.source || typeof payload.fields.first_name.confirmed !== 'boolean') throw new Error('Form handoff contract failed.');
  const geminiRequest = buildGeminiEnhancementRequest([{ programId: selected.programId, programName: selected.programName, description: selected.summary, source: { type: 'fixture' } }], { nycResident: true }); assertNoPii(geminiRequest);
  return { screeningInput, recommendations, selected, detailedResult, payload, geminiRequest };
}
