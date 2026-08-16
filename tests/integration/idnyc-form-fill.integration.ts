import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const OUTPUT_PATH = resolve(REPOSITORY_ROOT, 'test-output/idnyc-filled-test.pdf');

async function main() {
  console.log('\n========================================');
  console.log('IDNYC INTEGRATION TEST');
  console.log('========================================');

  console.log('\n1. DEMO PROFILE');
  console.log(`Applicant: ${DEMO_NYC_STUDENT_PROFILE.id}`);

  const eligibilityResult = checkEligibility(DEMO_NYC_STUDENT_PROFILE).find(
    (result) => result.programId === 'idnyc',
  );
  assert(eligibilityResult, 'IDNYC detailed validation result must exist.');
  assertEqual(eligibilityResult.status, 'potentially_eligible', 'IDNYC result must be potentially eligible.');
  console.log('\n2. IDNYC VALIDATION');
  console.log(`Status: ${eligibilityResult.status}`);

  const payload = generateFormPayload(DEMO_NYC_STUDENT_PROFILE, 'idnyc', eligibilityResult);
  assertEqual(payload.programId, 'idnyc', 'Payload must target IDNYC.');
  assert(payload.readyForPreview, 'IDNYC payload must be ready for preview.');
  assertEqual(payload.missingFields.length, 0, 'IDNYC payload must not have missing fields.');
  console.log('\n3. FORM PAYLOAD');
  console.log(`readyForPreview: ${payload.readyForPreview}`);
  console.log(`missingFields: ${payload.missingFields.length}`);

  const automationInput = toIdNycAutomationInput(payload);
  assertEqual(automationInput.profile.name.first, 'Demo', 'Adapter must map first_name.');
  assertEqual(automationInput.profile.name.last, 'Student', 'Adapter must map last_name.');
  assertEqual(automationInput.profile.dateOfBirth, '2002-09-01', 'Adapter must map date_of_birth.');
  assertEqual(automationInput.profile.address.street, '99 Fictional Avenue', 'Adapter must map street_address.');
  assertEqual(automationInput.profile.address.city, 'New York', 'Adapter must map city.');
  assertEqual(automationInput.profile.address.zip, '10001', 'Adapter must map zip_code.');
  assertEqual(automationInput.profile.email, 'demo.student@example.test', 'Adapter must map email.');
  assertEqual(automationInput.profile.phone, '212-555-0199', 'Adapter must map phone.');
  console.log('\n4. ADAPTER');
  console.log('first_name -> profile.name.first: PASS');
  console.log('last_name -> profile.name.last: PASS');
  console.log('date_of_birth -> profile.dateOfBirth: PASS');
  console.log('street_address -> profile.address.street: PASS');

  const templateBytes = readFileSync(TEMPLATE_PATH);
  assert(templateBytes.length > 0, 'IDNYC PDF template must contain bytes.');
  console.log('\n5. PDF TEMPLATE');
  console.log('Forms/IDNYCForm.pdf');
  console.log('Loaded: PASS');

  const filledBytes = await fillIdNycForm(templateBytes, automationInput.profile, automationInput.options);
  assert(filledBytes.length > 0, 'PDF filler must return bytes.');
  await assertFilledPdfFields(filledBytes);
  console.log('\n6. PDF FILL');
  console.log(`Output bytes: ${filledBytes.length}`);
  console.log('AcroForm values: PASS');

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, filledBytes);
  assert(readFileSync(OUTPUT_PATH).length > 0, 'Filled PDF output file must be written.');
  console.log('\n7. OUTPUT');
  console.log('test-output/idnyc-filled-test.pdf');

  runNegativeAdapterTests(payload);
  console.log('\n8. NEGATIVE ADAPTER TESTS');
  console.log('Wrong program: PASS');
  console.log('Not ready: PASS');
  console.log('Missing fields: PASS');
  console.log('Unconfirmed field: PASS');
  console.log('Missing value: PASS');

  console.log('\n========================================');
  console.log('IDNYC INTEGRATION TEST: PASS');
  console.log('========================================');
}

async function assertFilledPdfFields(bytes: Uint8Array) {
  const document = await PDFDocument.load(bytes);
  const form = document.getForm();
  assertEqual(form.getTextField(IdNycFormField.firstName).getText(), 'Demo', 'PDF first name must be filled.');
  assertEqual(form.getTextField(IdNycFormField.lastName).getText(), 'Student', 'PDF last name must be filled.');
  assertEqual(form.getTextField(IdNycFormField.dobMonth).getText(), '09', 'PDF birth month must be filled.');
  assertEqual(form.getTextField(IdNycFormField.dobDay).getText(), '01', 'PDF birth day must be filled.');
  assertEqual(form.getTextField(IdNycFormField.dobYear).getText(), '2002', 'PDF birth year must be filled.');
  assertEqual(form.getTextField(IdNycFormField.streetAddress).getText(), '99 Fictional Avenue', 'PDF street must be filled.');
  assertEqual(form.getTextField(IdNycFormField.city).getText(), 'New York', 'PDF city must be filled.');
  assertEqual(form.getTextField(IdNycFormField.zip).getText(), '10001', 'PDF ZIP must be filled.');
  assertEqual(form.getTextField(IdNycFormField.email).getText(), 'demo.student@example.test', 'PDF email must be filled.');
  assertEqual(form.getTextField(IdNycFormField.phoneAreaCode).getText(), '212', 'PDF phone area code must be filled.');
  assertEqual(form.getTextField(IdNycFormField.phonePrefix).getText(), '555', 'PDF phone prefix must be filled.');
  assertEqual(form.getTextField(IdNycFormField.phoneLine).getText(), '0199', 'PDF phone line must be filled.');
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

function clonePayload(payload: FormFillPayload): FormFillPayload {
  return {
    ...payload,
    fields: Object.fromEntries(
      Object.entries(payload.fields).map(([key, field]) => [key, { ...field }]),
    ),
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

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
