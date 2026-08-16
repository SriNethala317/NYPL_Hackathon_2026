import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { PDFDocument } from 'pdf-lib';

import { toIdNycAutomationInput } from '../../src/features/documents/adapters/idnyc-form-payload.adapter';
import { fillIdNycForm, IdNycFormField } from '../../src/features/documents';
import { checkEligibility } from '../../backend/src/features/eligibility';
import { generateFormPayload } from '../../backend/src/features/form-payload';
import type { FormFillPayload } from '../../backend/src/features/form-payload';
import { DEMO_NYC_STUDENT_PROFILE } from '../../backend/tests/integration/fixtures/demo-nyc-student';

const REPOSITORY_ROOT = resolve(__dirname, '..', '..');
const TEMPLATE_PATH = resolve(REPOSITORY_ROOT, 'Forms/IDNYCForm.pdf');
const OUTPUT_PATH = resolve(REPOSITORY_ROOT, 'test-output/idnyc-filled-mock.pdf');

let currentStep = 'START';

export async function runIdNycMockWorkflow() {
  console.log('\n========================================');
  console.log('IDNYC MOCK WORKFLOW');
  console.log('========================================');

  currentStep = 'STEP 1 — LOAD MOCK PROFILE';
  printStep(1, 'LOAD MOCK PROFILE');
  const profile = DEMO_NYC_STUDENT_PROFILE;
  assert(profile.id, 'Mock profile must contain an applicant ID.');
  printPass({
    applicantId: profile.id,
    profileSummary: {
      firstName: profile.identity?.firstName,
      lastName: profile.identity?.lastName,
      city: profile.residence?.city,
      state: profile.residence?.state,
      householdSize: profile.household?.householdSize,
    },
  });

  currentStep = 'STEP 2 — IDNYC ELIGIBILITY';
  printStep(2, 'IDNYC ELIGIBILITY');
  const eligibilityResult = checkEligibility(profile).find((result) => result.programId === 'idnyc');
  assert(eligibilityResult, 'IDNYC detailed validation result must exist.');
  assertEqual(eligibilityResult.status, 'potentially_eligible', 'IDNYC result must be potentially eligible.');
  printPass(eligibilityResult);

  currentStep = 'STEP 3 — GENERATE FORM PAYLOAD';
  printStep(3, 'GENERATE FORM PAYLOAD');
  const payload = generateFormPayload(profile, 'idnyc', eligibilityResult);
  assertEqual(payload.programId, 'idnyc', 'Payload must target IDNYC.');
  assert(payload.readyForPreview, 'IDNYC payload must be ready for preview.');
  assertEqual(payload.missingFields.length, 0, 'IDNYC payload must not have missing fields.');
  printPass({
    programId: payload.programId,
    applicantId: payload.applicantId,
    eligibilityStatus: payload.eligibilityStatus,
    missingFields: payload.missingFields,
    readyForPreview: payload.readyForPreview,
  });
  printMappedFields(payload);

  currentStep = 'STEP 4 — PAYLOAD ADAPTER';
  printStep(4, 'PAYLOAD ADAPTER');
  const automationInput = toIdNycAutomationInput(payload);
  assertEqual(automationInput.profile.name.first, 'Demo', 'Adapter must map first_name.');
  assertEqual(automationInput.profile.name.last, 'Student', 'Adapter must map last_name.');
  assertEqual(automationInput.profile.dateOfBirth, '2002-09-01', 'Adapter must map date_of_birth.');
  assertEqual(automationInput.profile.address.street, '99 Fictional Avenue', 'Adapter must map street_address.');
  assertEqual(automationInput.profile.address.city, 'New York', 'Adapter must map city.');
  assertEqual(automationInput.profile.address.zip, '10001', 'Adapter must map zip_code.');
  assertEqual(automationInput.profile.email, 'demo.student@example.test', 'Adapter must map email.');
  assertEqual(automationInput.profile.phone, '212-555-0199', 'Adapter must map phone.');
  printPass(automationInput.profile);

  currentStep = 'STEP 5 — LOAD IDNYC TEMPLATE';
  printStep(5, 'LOAD IDNYC TEMPLATE');
  assert(existsSync(TEMPLATE_PATH), `IDNYC template does not exist: ${TEMPLATE_PATH}`);
  const templateBytes = readFileSync(TEMPLATE_PATH);
  assert(templateBytes.length > 0, 'IDNYC PDF template must contain bytes.');
  printPass({ path: TEMPLATE_PATH, bytes: templateBytes.length });

  currentStep = 'STEP 6 — FILL IDNYC PDF';
  printStep(6, 'FILL IDNYC PDF');
  const filledBytes = await fillIdNycForm(templateBytes, automationInput.profile, automationInput.options);
  assert(filledBytes.length > 0, 'PDF filler must return bytes.');
  printPass({ generatedBytes: filledBytes.length });

  currentStep = 'STEP 7 — VERIFY FILLED FIELDS';
  printStep(7, 'VERIFY FILLED FIELDS');
  await verifyFilledPdfFields(filledBytes);
  console.log('Status: PASS');

  currentStep = 'STEP 8 — SAVE OUTPUT';
  printStep(8, 'SAVE OUTPUT');
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, filledBytes);
  assert(existsSync(OUTPUT_PATH), 'Filled PDF output file must be created.');
  const outputBytes = statSync(OUTPUT_PATH).size;
  assert(outputBytes > 0, 'Filled PDF output file must contain bytes.');
  printPass({ savedTo: OUTPUT_PATH, bytes: outputBytes });

  runNegativeAdapterTests(payload);
  printSummary(OUTPUT_PATH);
}

function printStep(step: number, title: string) {
  console.log(`\n========================================\nSTEP ${step} — ${title}\n========================================`);
}

function printPass(data?: unknown) {
  console.log('Status: PASS');
  if (data !== undefined) console.log(JSON.stringify(data, null, 2));
}

function printMappedFields(payload: FormFillPayload) {
  console.log('\nMapped fields:');
  for (const [semanticKey, field] of Object.entries(payload.fields)) {
    console.log(`${semanticKey}\n  value: ${String(field.value)}\n  source: ${field.source}\n  confirmed: ${field.confirmed}`);
  }
}

async function verifyFilledPdfFields(bytes: Uint8Array) {
  const document = await PDFDocument.load(bytes);
  const form = document.getForm();
  const fields = [
    ['First Name', 'Demo', form.getTextField(IdNycFormField.firstName).getText()],
    ['Last Name', 'Student', form.getTextField(IdNycFormField.lastName).getText()],
    ['Birth Month', '09', form.getTextField(IdNycFormField.dobMonth).getText()],
    ['Birth Day', '01', form.getTextField(IdNycFormField.dobDay).getText()],
    ['Birth Year', '2002', form.getTextField(IdNycFormField.dobYear).getText()],
    ['Street', '99 Fictional Avenue', form.getTextField(IdNycFormField.streetAddress).getText()],
    ['City', 'New York', form.getTextField(IdNycFormField.city).getText()],
    ['ZIP', '10001', form.getTextField(IdNycFormField.zip).getText()],
    ['Email', 'demo.student@example.test', form.getTextField(IdNycFormField.email).getText()],
    ['Phone Area Code', '212', form.getTextField(IdNycFormField.phoneAreaCode).getText()],
    ['Phone Prefix', '555', form.getTextField(IdNycFormField.phonePrefix).getText()],
    ['Phone Line', '0199', form.getTextField(IdNycFormField.phoneLine).getText()],
  ] as const;

  for (const [label, expected, actual] of fields) {
    console.log(`${label}:\n  expected: ${expected}\n  actual: ${actual ?? ''}`);
    assertEqual(actual, expected, `${label} PDF field must be filled.`);
    console.log('  PASS');
  }
}

function runNegativeAdapterTests(payload: FormFillPayload) {
  assertThrows(() => toIdNycAutomationInput({ ...clonePayload(payload), programId: 'fair_fares' }), 'Wrong program must reject.');
  assertThrows(() => toIdNycAutomationInput({ ...clonePayload(payload), readyForPreview: false }), 'Not-ready payload must reject.');
  assertThrows(() => toIdNycAutomationInput({ ...clonePayload(payload), missingFields: ['first_name'] }), 'Payload with missing fields must reject.');

  const unconfirmed = clonePayload(payload);
  unconfirmed.fields.first_name.confirmed = false;
  assertThrows(() => toIdNycAutomationInput(unconfirmed), 'Unconfirmed field must reject.');

  const missingValue = clonePayload(payload);
  missingValue.fields.first_name.value = null;
  assertThrows(() => toIdNycAutomationInput(missingValue), 'Null required field value must reject.');
}

function printSummary(outputPath: string) {
  console.log('\n========================================');
  console.log('IDNYC MOCK WORKFLOW SUMMARY');
  console.log('========================================');
  console.log('1. Mock profile loaded       PASS');
  console.log('2. IDNYC eligibility        PASS');
  console.log('3. Form payload generated   PASS');
  console.log('4. Adapter transformed      PASS');
  console.log('5. PDF template loaded      PASS');
  console.log('6. PDF filled               PASS');
  console.log('7. PDF fields verified      PASS');
  console.log('8. Output saved             PASS');
  console.log('\nFINAL RESULT: PASS');
  console.log(`Saved PDF:\n${outputPath}`);
  console.log('========================================');
}

function clonePayload(payload: FormFillPayload): FormFillPayload {
  return {
    ...payload,
    fields: Object.fromEntries(Object.entries(payload.fields).map(([key, field]) => [key, { ...field }])),
    missingFields: [...payload.missingFields],
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function assertThrows(action: () => void, message: string) {
  try {
    action();
  } catch {
    return;
  }
  throw new Error(message);
}

runIdNycMockWorkflow().catch((error: unknown) => {
  console.error('\n========================================');
  console.error('IDNYC MOCK WORKFLOW: FAILED');
  console.error('========================================');
  console.error(`Failed Step:\n${currentStep}`);
  console.error(`Reason:\n${error instanceof Error ? error.message : 'Unknown error'}`);
  process.exitCode = 1;
});
