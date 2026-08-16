import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { PDFDocument } from 'pdf-lib';

import {
  checkIdNycFormCompletion,
  IdNycFormInputIncompleteError,
  toIdNycAutomationInput,
  fillIdNycForm,
  IdNycFormField,
  type IdNycSupplementalInput,
} from '../../src/features/documents';
import { checkEligibility } from '../../backend/src/features/eligibility';
import { generateFormPayload } from '../../backend/src/features/form-payload';
import type { FormFillPayload } from '../../backend/src/features/form-payload';
import { DEMO_NYC_STUDENT_PROFILE } from '../../backend/tests/integration/fixtures/demo-nyc-student';

const REPOSITORY_ROOT = resolve(__dirname, '..', '..');
const TEMPLATE_PATH = resolve(REPOSITORY_ROOT, 'Forms/IDNYCForm.pdf');
const OUTPUT_PATH = resolve(REPOSITORY_ROOT, 'test-output/idnyc-filled-complete-mock.pdf');

/** Clearly fictional answers used only by this deterministic integration test. */
const MOCK_IDNYC_SUPPLEMENTAL_INPUT: IdNycSupplementalInput = {
  applicationType: 'new',
  middleName: 'Quincy',
  apartmentUnit: '5B',
  borough: 'manhattan',
  eyeColor: 'brown',
  heightFeet: 5,
  heightInches: 8,
  gender: 'notDesignated',
  languagePreference: 'English',
  veteranDesignation: false,
  organDonor: false,
  emergencyContact: { name: 'Fictional Contact', phone: '212-555-0100' },
};

let currentStep = 'START';

export async function runIdNycMockWorkflow() {
  console.log('\n========================================');
  console.log('IDNYC COMPLETE MOCK WORKFLOW');
  console.log('========================================');

  currentStep = 'STEP 1 - LOAD MOCK PROFILE';
  printStep(1, 'LOAD MOCK PROFILE');
  const profile = DEMO_NYC_STUDENT_PROFILE;
  assert(profile.id, 'Mock profile must contain an applicant ID.');
  printPass({ applicantId: profile.id, profileSummary: {
    firstName: profile.identity?.firstName, lastName: profile.identity?.lastName,
    city: profile.residence?.city, state: profile.residence?.state,
  } });

  currentStep = 'STEP 2 - IDNYC ELIGIBILITY';
  printStep(2, 'IDNYC ELIGIBILITY');
  const eligibilityResult = checkEligibility(profile).find((result) => result.programId === 'idnyc');
  assert(eligibilityResult, 'IDNYC detailed validation result must exist.');
  assertEqual(eligibilityResult.status, 'potentially_eligible', 'IDNYC result must be potentially eligible.');
  printPass(eligibilityResult);

  currentStep = 'STEP 3 - BASE FORM PAYLOAD';
  printStep(3, 'BASE FORM PAYLOAD');
  const payload = generateFormPayload(profile, 'idnyc', eligibilityResult);
  assert(payload.readyForPreview, 'IDNYC payload must be ready for preview.');
  assertEqual(payload.missingFields.length, 0, 'IDNYC payload must not have missing fields.');
  printPass({ programId: payload.programId, applicantId: payload.applicantId,
    eligibilityStatus: payload.eligibilityStatus, missingFields: payload.missingFields,
    readyForPreview: payload.readyForPreview });
  printMappedFields(payload);

  currentStep = 'STEP 4 - CHECK FORM COMPLETENESS';
  printStep(4, 'CHECK FORM COMPLETENESS');
  const initialCompletion = checkIdNycFormCompletion(payload);
  assert(!initialCompletion.complete, 'Base payload must request additional form-specific required input.');
  assert(initialCompletion.requiredQuestions.length > 0, 'Expected additional required IDNYC questions.');
  console.log('Status: WAITING_FOR_USER_INPUT');
  printQuestionGroups(initialCompletion);
  assertThrows(
    () => toIdNycAutomationInput(payload),
    'Adapter must reject missing required supplemental input.',
    IdNycFormInputIncompleteError,
  );

  currentStep = 'STEP 5 - APPLY MOCK SUPPLEMENTAL ANSWERS';
  printStep(5, 'APPLY MOCK SUPPLEMENTAL ANSWERS');
  printPass({ ...MOCK_IDNYC_SUPPLEMENTAL_INPUT, emergencyContact: '[fictional test contact]' });

  currentStep = 'STEP 6 - RECHECK FORM COMPLETENESS';
  printStep(6, 'RECHECK FORM COMPLETENESS');
  const completeCheck = checkIdNycFormCompletion(payload, MOCK_IDNYC_SUPPLEMENTAL_INPUT);
  assert(completeCheck.complete, 'Mock supplemental input must resolve all required IDNYC questions.');
  assertEqual(completeCheck.requiredQuestions.length, 0, 'No required form questions should remain.');
  printPass({ requiredUnresolved: 0, optionalUnresolved: completeCheck.optionalQuestions.length,
    manualFields: completeCheck.manualFields.map((field) => field.key),
    unsupportedFields: completeCheck.unsupportedFields.map((field) => field.key) });

  currentStep = 'STEP 7 - PAYLOAD ADAPTER';
  printStep(7, 'PAYLOAD ADAPTER');
  const automationInput = toIdNycAutomationInput(payload, MOCK_IDNYC_SUPPLEMENTAL_INPUT);
  assertEqual(automationInput.profile.name.first, 'Demo', 'Adapter must map first_name.');
  assertEqual(automationInput.profile.name.last, 'Student', 'Adapter must map last_name.');
  assertEqual(automationInput.profile.heightInches, 68, 'Adapter must combine height fields.');
  assertEqual(automationInput.options.applicationType, 'new', 'Adapter must map application type.');
  printPass(automationInput.profile);

  currentStep = 'STEP 8 - LOAD IDNYC TEMPLATE';
  printStep(8, 'LOAD IDNYC TEMPLATE');
  assert(existsSync(TEMPLATE_PATH), `IDNYC template does not exist: ${TEMPLATE_PATH}`);
  const templateBytes = readFileSync(TEMPLATE_PATH);
  assert(templateBytes.length > 0, 'IDNYC PDF template must contain bytes.');
  printPass({ path: TEMPLATE_PATH, bytes: templateBytes.length });

  currentStep = 'STEP 9 - FILL IDNYC PDF';
  printStep(9, 'FILL IDNYC PDF');
  const filledBytes = await fillIdNycForm(templateBytes, automationInput.profile, automationInput.options);
  assert(filledBytes.length > 0, 'PDF filler must return bytes.');
  printPass({ generatedBytes: filledBytes.length });

  currentStep = 'STEP 10 - VERIFY FILLED FIELDS';
  printStep(10, 'VERIFY FILLED FIELDS');
  await verifyFilledPdfFields(filledBytes);
  console.log('Status: PASS');

  currentStep = 'STEP 11 - SAVE OUTPUT';
  printStep(11, 'SAVE OUTPUT');
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, filledBytes);
  assert(existsSync(OUTPUT_PATH), 'Filled PDF output file must be created.');
  const outputBytes = statSync(OUTPUT_PATH).size;
  assert(outputBytes > 0, 'Filled PDF output file must contain bytes.');
  printPass({ savedTo: OUTPUT_PATH, bytes: outputBytes });

  runNegativeAdapterTests(payload);
  runFormRequirementTests(payload);
  printCoverage(completeCheck);
  printSummary(OUTPUT_PATH);
}

function printStep(step: number, title: string) {
  console.log(`\n========================================\nSTEP ${step} - ${title}\n========================================`);
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
  const form = (await PDFDocument.load(bytes)).getForm();
  const fields = [
    ['First Name', 'Demo', form.getTextField(IdNycFormField.firstName).getText()],
    ['Middle Name', 'Quincy', form.getTextField(IdNycFormField.middleName).getText()],
    ['Last Name', 'Student', form.getTextField(IdNycFormField.lastName).getText()],
    ['Birth Month', '09', form.getTextField(IdNycFormField.dobMonth).getText()],
    ['Birth Day', '01', form.getTextField(IdNycFormField.dobDay).getText()],
    ['Birth Year', '2002', form.getTextField(IdNycFormField.dobYear).getText()],
    ['Street', '99 Fictional Avenue', form.getTextField(IdNycFormField.streetAddress).getText()],
    ['Unit', '5B', form.getTextField(IdNycFormField.addressUnit).getText()],
    ['City', 'New York', form.getTextField(IdNycFormField.city).getText()],
    ['ZIP', '10001', form.getTextField(IdNycFormField.zip).getText()],
    ['Email', 'demo.student@example.test', form.getTextField(IdNycFormField.email).getText()],
    ['Phone Area Code', '212', form.getTextField(IdNycFormField.phoneAreaCode).getText()],
    ['Phone Prefix', '555', form.getTextField(IdNycFormField.phonePrefix).getText()],
    ['Phone Line', '0199', form.getTextField(IdNycFormField.phoneLine).getText()],
    ['Language', 'English', form.getTextField(IdNycFormField.languagePreference).getText()],
    ['Emergency Contact', 'Fictional Contact', form.getTextField(IdNycFormField.emergencyContactName).getText()],
    ['Emergency Phone Area', '212', form.getTextField(IdNycFormField.emergencyContactPhoneAreaCode).getText()],
    ['Emergency Phone Prefix', '555', form.getTextField(IdNycFormField.emergencyContactPhonePrefix).getText()],
    ['Emergency Phone Line', '0100', form.getTextField(IdNycFormField.emergencyContactPhoneLine).getText()],
  ] as const;
  for (const [label, expected, actual] of fields) {
    console.log(`${label}: expected ${expected}; actual ${actual ?? ''}`);
    assertEqual(actual, expected, `${label} PDF field must be filled.`);
  }
  assert(form.getCheckBox(IdNycFormField.applicationTypeNew).isChecked(), 'Application type must be filled.');
  assertEqual(form.getRadioGroup(IdNycFormField.eyeColor).getSelected(), '13a', 'Eye color must be filled.');
  assertEqual(form.getTextField(IdNycFormField.heightFeet).getText(), '5', 'Height feet must be filled.');
  assertEqual(form.getTextField(IdNycFormField.heightInches).getText(), '8', 'Height inches must be filled.');
  assertEqual(form.getRadioGroup(IdNycFormField.gender).getSelected(), '16c', 'Gender must be filled.');
  assertEqual(form.getRadioGroup(IdNycFormField.borough).getSelected(), '28c', 'Borough must be filled.');
  assert(!form.getCheckBox(IdNycFormField.veteran).isChecked(), 'Veteran checkbox must remain unchecked for false.');
  assert(!form.getCheckBox(IdNycFormField.organDonor).isChecked(), 'Organ donor checkbox must remain unchecked for false.');
}

function runNegativeAdapterTests(payload: FormFillPayload) {
  assertThrows(() => toIdNycAutomationInput({ ...clonePayload(payload), programId: 'fair_fares' }, MOCK_IDNYC_SUPPLEMENTAL_INPUT), 'Wrong program must reject.');
  assertThrows(() => toIdNycAutomationInput({ ...clonePayload(payload), readyForPreview: false }, MOCK_IDNYC_SUPPLEMENTAL_INPUT), 'Not-ready payload must reject.');
  assertThrows(() => toIdNycAutomationInput({ ...clonePayload(payload), missingFields: ['first_name'] }, MOCK_IDNYC_SUPPLEMENTAL_INPUT), 'Payload with missing fields must reject.');
  const unconfirmed = clonePayload(payload); unconfirmed.fields.first_name.confirmed = false;
  assertThrows(() => toIdNycAutomationInput(unconfirmed, MOCK_IDNYC_SUPPLEMENTAL_INPUT), 'Unconfirmed field must reject.');
  const missingValue = clonePayload(payload); missingValue.fields.first_name.value = null;
  assertThrows(() => toIdNycAutomationInput(missingValue, MOCK_IDNYC_SUPPLEMENTAL_INPUT), 'Null required field value must reject.');
  assertThrows(() => toIdNycAutomationInput(payload, { ...MOCK_IDNYC_SUPPLEMENTAL_INPUT, eyeColor: 'violet' as never }), 'Invalid select value must reject.');
  assertThrows(() => toIdNycAutomationInput(payload, { ...MOCK_IDNYC_SUPPLEMENTAL_INPUT, heightInches: undefined }), 'Missing required physical field must reject.');
}

function runFormRequirementTests(payload: FormFillPayload) {
  const requiredOnly: IdNycSupplementalInput = {
    applicationType: 'new', eyeColor: 'brown', heightFeet: 5, heightInches: 8,
    gender: 'notDesignated', borough: 'manhattan',
  };
  const optionalOmitted = checkIdNycFormCompletion(payload, requiredOnly);
  assert(optionalOmitted.complete, 'Omitting optional middle name and emergency contact must not block completion.');
  assert(optionalOmitted.optionalQuestions.some((question) => question.key === 'middle_name'), 'Middle name must remain optional.');
  assert(optionalOmitted.optionalQuestions.some((question) => question.key === 'emergency_contact_name'), 'Emergency contact must remain optional.');

  const donorCheck = checkIdNycFormCompletion(payload, { ...requiredOnly, organDonor: true });
  assert(donorCheck.manualFields.some((field) => field.key === 'organ_donor_signature'), 'Organ donor election must require a manual signature.');

  const renewalCheck = checkIdNycFormCompletion(payload, { ...requiredOnly, applicationType: 'renewal' });
  assert(renewalCheck.unsupportedFields.some((field) => field.key === 'idnyc_number'), 'Renewal must report the unsupported existing IDNYC number field.');
}

function printQuestionGroups(check: ReturnType<typeof checkIdNycFormCompletion>) {
  for (const [label, questions] of [['REQUIRED', check.requiredQuestions], ['OPTIONAL', check.optionalQuestions], ['MANUAL', check.manualFields]] as const) {
    console.log(`\n${label}:`);
    for (const question of questions) console.log(`- ${question.label} (${question.key})`);
  }
}

function printCoverage(check: ReturnType<typeof checkIdNycFormCompletion>) {
  console.log('\nIDNYC FORM COVERAGE');
  console.log('Total automatable PDF fields: 31');
  console.log('Populated: 27 (the four unselected application-type alternatives are intentionally blank)');
  console.log(`Optional blank: ${check.optionalQuestions.length + 2} (veteran and organ-donor checkboxes are explicit false answers)`);
  console.log(`Manual-only: ${check.manualFields.map((field) => field.key).join(', ')}`);
  console.log(`Unsupported: ${check.unsupportedFields.map((field) => field.key).join(', ') || 'none for this application type'}`);
}

function printSummary(outputPath: string) {
  console.log('\n========================================');
  console.log('IDNYC COMPLETE MOCK WORKFLOW SUMMARY');
  console.log('========================================');
  console.log('1. Mock profile loaded       PASS');
  console.log('2. IDNYC eligibility        PASS');
  console.log('3. Base payload generated   PASS');
  console.log('4. Requirements checked     PASS');
  console.log('5. Mock answers applied     PASS');
  console.log('6. Adapter transformed      PASS');
  console.log('7. PDF template loaded      PASS');
  console.log('8. PDF filled               PASS');
  console.log('9. PDF fields verified      PASS');
  console.log('10. Output saved            PASS');
  console.log(`\nFINAL RESULT: PASS\nSaved PDF:\n${outputPath}`);
  console.log('========================================');
}

function clonePayload(payload: FormFillPayload): FormFillPayload {
  return { ...payload, fields: Object.fromEntries(Object.entries(payload.fields).map(([key, field]) => [key, { ...field }])), missingFields: [...payload.missingFields] };
}

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function assertEqual<T>(actual: T, expected: T, message: string) { if (actual !== expected) throw new Error(`${message} Expected ${String(expected)}, received ${String(actual)}.`); }
function assertThrows(action: () => void, message: string, errorType?: new (...args: never[]) => Error) {
  try { action(); } catch (error) {
    if (errorType && !(error instanceof errorType)) throw new Error(`${message} Expected ${errorType.name}.`);
    return;
  }
  throw new Error(message);
}

runIdNycMockWorkflow().catch((error: unknown) => {
  console.error('\n========================================\nIDNYC COMPLETE MOCK WORKFLOW: FAILED\n========================================');
  console.error(`Failed Step:\n${currentStep}`);
  console.error(`Reason:\n${error instanceof Error ? error.message : 'Unknown error'}`);
  process.exitCode = 1;
});
