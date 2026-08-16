import { discoverBenefits } from '@/features/benefits-discovery';
import { checkEligibility } from '@/features/eligibility';
import { generateFormPayload } from '@/features/form-payload';

import { DEMO_NYC_STUDENT_PROFILE } from './fixtures/demo-nyc-student';

async function runMockWorkflow() {
  console.log('\n========================================');
  console.log('NYC BENEFITS MOCK WORKFLOW TEST');
  console.log('========================================\n');

  // --------------------------------------------------
  // 1. Mock user
  // --------------------------------------------------

  const profile = DEMO_NYC_STUDENT_PROFILE;

  console.log('1. MOCK USER LOADED');
  console.log('Applicant ID:', profile.id);

  // --------------------------------------------------
  // 2. Broad benefits discovery
  // --------------------------------------------------

  console.log('\n2. RUNNING BENEFITS DISCOVERY...\n');

  const recommendations = await discoverBenefits(profile);

  console.log(`Found ${recommendations.length} recommendations:\n`);

  recommendations.forEach((program, index) => {
    console.log(`${index + 1}. ${program.programName}`);
    console.log(`   ID: ${program.programId}`);
    console.log(`   Status: ${program.discoveryStatus}`);
    console.log(
      `   Detailed validation: ${program.detailedValidationSupported}`,
    );
    console.log(
      `   Form automation: ${program.formAutomationSupported}`,
    );
    console.log(`   Discovery source: ${program.discoverySource}`);
    console.log(`   Metadata source: ${program.metadataSource}`);
    console.log(`   Explanation source: ${program.explanationSource}`);
    console.log('');
  });

  if (recommendations.length <= 3) {
    throw new Error(
      `Expected more than 3 benefit recommendations, received ${recommendations.length}.`,
    );
  }

  // --------------------------------------------------
  // 3. Deep validation is intentionally separate from broad catalog ranking.
  // --------------------------------------------------

  console.log('3. SELECTING FAIR FARES FOR DETAILED VALIDATION...\n');

  // --------------------------------------------------
  // 4. Detailed eligibility
  // --------------------------------------------------

  console.log('\n4. RUNNING DETAILED VALIDATION...\n');

  const eligibilityResults = checkEligibility(profile);

  const fairFaresEligibility = eligibilityResults.find(
    (result) => result.programId === 'fair_fares',
  );

  if (!fairFaresEligibility) {
    throw new Error(
      'Fair Fares detailed eligibility result was not generated.',
    );
  }

  console.log(
    JSON.stringify(fairFaresEligibility, null, 2),
  );

  // --------------------------------------------------
  // 5. Generate form payload
  // --------------------------------------------------

  console.log('\n5. GENERATING FORM PAYLOAD...\n');

  const payload = generateFormPayload(
    profile,
    'fair_fares',
    fairFaresEligibility,
  );

  console.log(JSON.stringify(payload, null, 2));

  // --------------------------------------------------
  // 6. Final result
  // --------------------------------------------------

  console.log('\n========================================');

  if (payload.readyForPreview) {
    console.log('MOCK WORKFLOW: PASS');
    console.log('Form is ready for preview.');
  } else {
    console.log('MOCK WORKFLOW: PARTIAL');
    console.log(
      'Workflow completed but additional form information is required.',
    );

    console.log('Missing fields:', payload.missingFields);
  }

  console.log('========================================\n');
}

runMockWorkflow().catch((error) => {
  console.error('\nMOCK WORKFLOW: FAILED\n');
  console.error(error);

  process.exit(1);
});
