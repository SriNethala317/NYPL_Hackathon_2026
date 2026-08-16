import { GEMINI_CONFIG } from '@/config/gemini.config';
import { preFilterPrograms } from '@/features/benefits-discovery/pre-filter-programs';
import { toBenefitRecommendationContext } from '@/features/benefits-discovery/to-benefit-recommendation-context';
import { buildGeminiEnhancementRequest, GeminiBenefitExplanationProvider } from '@/features/benefits-discovery/providers/gemini-benefit-explanation.provider';
import { NycBenefitsCatalogProvider } from '@/features/benefits-discovery/providers/nyc-benefits-catalog.provider';
import type { GeminiProgramMatch } from '@/features/benefits-discovery/types';
import { DEMO_NYC_STUDENT_PROFILE } from './fixtures/demo-nyc-student';

const PII_KEYS = ['firstName', 'lastName', 'email', 'phone', 'street', 'dateOfBirth', 'sevisId', 'passportNumber'];
const PII_VALUES = ['demo.student@example.test', '99 Fictional Avenue'];
const PROHIBITED_CLAIMS = ['you are eligible', 'you qualify', 'you definitely qualify', 'you will receive', 'you are approved', 'guaranteed'];
const KNOWN_HISTORICAL_PROGRAMS = new Set(['Affordable Connectivity Program', 'Emergency Broadband Benefit']);

function countPiiOccurrences(value: unknown): { keys: string[]; values: string[] } {
  const serialized = JSON.stringify(value);
  return {
    keys: PII_KEYS.filter((key) => serialized.includes(`\"${key}\"`)),
    values: PII_VALUES.filter((item) => serialized.includes(item)),
  };
}

function validateMatches(matches: GeminiProgramMatch[], suppliedIds: Set<string>): void {
  if (!matches.length) throw new Error('Gemini returned no recommendations.');
  const duplicateIds = matches.map((match) => match.programId).filter((id, index, ids) => ids.indexOf(id) !== index);
  const unknownIds = matches.filter((match) => !suppliedIds.has(match.programId)).map((match) => match.programId);
  const invalidStatuses = matches.filter((match) => !['recommended_match', 'possible_match', 'needs_more_information'].includes(match.matchStatus));
  const invalidScores = matches.filter((match) => !Number.isFinite(match.relevanceScore) || match.relevanceScore < 0 || match.relevanceScore > 100);
  const incomplete = matches.filter((match) => !match.programId || !match.reason || match.relevanceScore === undefined);
  const prohibitedClaims = matches.filter((match) => PROHIBITED_CLAIMS.some((phrase) => match.reason.toLowerCase().includes(phrase)));
  if (unknownIds.length || duplicateIds.length || invalidStatuses.length || invalidScores.length || incomplete.length || prohibitedClaims.length) {
    throw new Error(JSON.stringify({ unknownIds, duplicateIds, invalidStatuses: invalidStatuses.length, invalidScores: invalidScores.length, incomplete: incomplete.length, prohibitedClaims: prohibitedClaims.map((match) => match.programId) }));
  }
}

function reportRelevanceSignals(matches: GeminiProgramMatch[], namesById: Map<string, string>): Record<string, boolean> {
  const corpus = matches.map((match) => `${namesById.get(match.programId) ?? ''} ${match.reason}`).join(' ').toLowerCase();
  return {
    transportation: /transport|transit|fare/.test(corpus),
    healthcare: /health|care|insurance/.test(corpus),
    foodAssistance: /food|snap|nutrition|grocery/.test(corpus),
    educationOrEmployment: /student|education|school|employ|job|train/.test(corpus),
    lowIncomeAssistance: /income|cash|housing|assistance/.test(corpus),
  };
}

async function run(): Promise<void> {
  console.log('\n========================================\nGEMINI BENEFITS MODEL EVALUATION\n========================================\n');
  console.log(`Gemini enabled: ${GEMINI_CONFIG.enabled}`);
  console.log(`API key configured: ${Boolean(GEMINI_CONFIG.apiKey)}`);
  console.log(`Model: ${GEMINI_CONFIG.model}`);
  if (!GEMINI_CONFIG.apiKey) {
    console.log('\nLive Gemini test skipped: GEMINI_API_KEY is not configured.');
    return;
  }

  const context = toBenefitRecommendationContext(DEMO_NYC_STUDENT_PROFILE);
  console.log('\nSAFE USER CONTEXT');
  console.log(JSON.stringify(context, null, 2));

  const catalog = new NycBenefitsCatalogProvider();
  const programs = await catalog.getPrograms();
  const candidates = preFilterPrograms(programs, context);
  const request = buildGeminiEnhancementRequest(candidates, context);
  const pii = countPiiOccurrences(request);
  console.log('\nPRIVACY CHECK');
  console.log(`PII keys detected: ${pii.keys.length}`);
  console.log(`PII values detected: ${pii.values.length}`);
  if (pii.keys.length || pii.values.length) throw new Error('PII was found in the final Gemini request.');

  const stats = catalog.getLastLoadStats();
  console.log('\nNYC DATASET');
  console.log(`Raw multilingual rows: ${stats?.rawMultilingualRows ?? 'unknown'}`);
  console.log(`Normalized English programs: ${stats?.normalizedEnglishPrograms ?? programs.length}`);
  console.log(`Programs selected for Gemini: ${candidates.length}`);
  console.log('\nPROGRAMS SENT TO GEMINI');
  candidates.forEach((program, index) => console.log(`${index + 1}. ${program.programName}\n   ID: ${program.programId}`));
  const historical = candidates.filter((program) => KNOWN_HISTORICAL_PROGRAMS.has(program.programName));
  if (historical.length) console.log(`\nCURRENTNESS WARNING: catalog candidates include known historical programs: ${historical.map((program) => program.programName).join(', ')}.`);

  const matches = await new GeminiBenefitExplanationProvider().enhance(candidates, context);
  const suppliedIds = new Set(candidates.map((program) => program.programId));
  validateMatches(matches, suppliedIds);
  const namesById = new Map(candidates.map((program) => [program.programId, program.programName]));
  console.log('\nGEMINI RECOMMENDATIONS');
  matches.forEach((match, index) => {
    console.log(`\n${index + 1}. ${namesById.get(match.programId)}\n   Program ID: ${match.programId}\n   Status: ${match.matchStatus}\n   Score: ${match.relevanceScore}\n   Reason: ${match.reason}\n   Missing information: ${match.missingInformation?.join(', ') ?? 'None'}`);
  });
  console.log('\nMODEL VALIDATION');
  console.log('Valid program IDs: PASS');
  console.log('Hallucinated program IDs: 0');
  console.log('Duplicate IDs: PASS');
  console.log('Score range: PASS');
  console.log('Structured output: PASS');
  console.log('Unsupported eligibility claims: PASS');
  console.log('PII boundary: PASS');
  console.log('Relevance signals:', JSON.stringify(reportRelevanceSignals(matches, namesById)));
  console.log('\n========================================\nLIVE GEMINI MODEL TEST: PASS\n========================================');
}

run().catch((error) => { console.error('\nLIVE GEMINI MODEL TEST: FAILED\n', error); process.exit(1); });
