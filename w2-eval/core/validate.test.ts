import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeAmount, normalizeText, normalizeYear, valuesAgree } from './normalize.ts';
import { emptyFields, redactForOutput, W2Fields } from './schema.ts';
import { applyPenalties, validate, type WarningCode } from './validate.ts';

/**
 * The validators are the only hallucination detector that works without ground truth, so they are
 * the thing most worth pinning. Every case below starts from a W-2 whose arithmetic is internally
 * correct and then breaks exactly one thing, because a test that corrupts two fields cannot tell
 * you which check caught it.
 */

/** A consistent W-2: 6.2% and 1.45% both hold, wages under the 2025 base, Box 1 the lowest. */
function goodW2(overrides: Partial<W2Fields> = {}): W2Fields {
  return W2Fields.parse({
    ...emptyFields(),
    employee_name: 'MARIA REYES',
    employer_name: 'ATLAS HOME CARE INC',
    employer_ein: '12-3456789',
    employee_ssn: '900-99-1234',
    tax_year: '2025',
    box1_wages: '27720.00',
    box2_federal_tax: '1980.00',
    box3_ss_wages: '29000.00',
    box4_ss_tax: '1798.00', // 29000 * 0.062
    box5_medicare_wages: '29000.00',
    box6_medicare_tax: '420.50', // 29000 * 0.0145
    box12: [{ code: 'D', amount: '1280.00' }],
    ...overrides,
  });
}

function codes(fields: W2Fields): WarningCode[] {
  return validate(fields).map((w) => w.code);
}

test('a consistent W-2 produces no warnings at all', () => {
  assert.deepEqual(codes(goodW2()), []);
});

test('cent-level rounding drift is tolerated', () => {
  // Payroll systems withhold per pay period and round each time, so the annual total drifts.
  assert.deepEqual(codes(goodW2({ box4_ss_tax: '1798.02' })), []);
  assert.deepEqual(codes(goodW2({ box6_medicare_tax: '420.48' })), []);
});

test('a dropped digit in Social Security tax is caught by the 6.2% check', () => {
  assert.deepEqual(codes(goodW2({ box4_ss_tax: '198.00' })), ['ss-tax-mismatch']);
});

test('a dropped digit in Medicare tax is caught by the 1.45% check', () => {
  assert.deepEqual(codes(goodW2({ box6_medicare_tax: '42.05' })), ['medicare-tax-mismatch']);
});

test('an extra digit in Box 3 trips the wage base ceiling', () => {
  // 290000 also breaks the 6.2% relationship, so both fire -- that is the point of the check.
  const found = codes(goodW2({ box3_ss_wages: '290000.00' }));
  assert.ok(found.includes('ss-wage-base-exceeded'), `expected wage-base warning, got ${found}`);
});

test('the wage base is read per year, not from one hardcoded figure', () => {
  // 140000 is over the 2020 base (137,700) and under the 2025 one (176,100).
  const wages = { box3_ss_wages: '140000.00', box4_ss_tax: '8680.00' };
  assert.ok(codes(goodW2({ ...wages, tax_year: '2020' })).includes('ss-wage-base-exceeded'));
  assert.ok(!codes(goodW2({ ...wages, tax_year: '2025' })).includes('ss-wage-base-exceeded'));
});

test('a high earner is not flagged for the 0.9% additional Medicare tax', () => {
  // Above $200,000 the correct withholding is 1.45% PLUS 0.9% on the excess. Checking only the
  // 1.45% would flag every high earner as a misread -- and those are exactly the households whose
  // income figure most needs to be trusted.
  const wages = '250000.00';
  const correct = (250000 * 0.0145 + 50000 * 0.009).toFixed(2); // 3625 + 450 = 4075.00
  assert.equal(correct, '4075.00');

  const fields = goodW2({
    box1_wages: '250000.00',
    box3_ss_wages: '176100.00', // at the 2025 cap
    box4_ss_tax: (176100 * 0.062).toFixed(2),
    box5_medicare_wages: wages,
    box6_medicare_tax: correct,
  });
  assert.ok(!codes(fields).includes('medicare-tax-mismatch'), `unexpected: ${codes(fields)}`);

  // The plain 1.45% figure is now the wrong answer for this wage, and is caught.
  const naive = goodW2({
    box1_wages: '250000.00',
    box3_ss_wages: '176100.00',
    box4_ss_tax: (176100 * 0.062).toFixed(2),
    box5_medicare_wages: wages,
    box6_medicare_tax: (250000 * 0.0145).toFixed(2),
  });
  assert.ok(codes(naive).includes('medicare-tax-mismatch'));
});

test('Box 4 above the year maximum is caught even when its ratio to Box 3 holds', () => {
  // The 6.2% check alone cannot see this: if BOTH boxes are read with the same extra digit their
  // ratio still holds, and only the absolute magnitude betrays the misread.
  const fields = goodW2({ box3_ss_wages: '290000.00', box4_ss_tax: '17980.00' });
  const found = codes(fields);

  assert.ok(!found.includes('ss-tax-mismatch'), '6.2% still holds, so that check stays quiet');
  assert.ok(found.includes('ss-tax-ceiling-exceeded'), `expected the ceiling to fire, got ${found}`);
});

test('Box 4 exactly at the year maximum is accepted', () => {
  // 6.2% of the 2025 wage base is 10,918.20 to the cent. An earner at the cap is not an error.
  const fields = goodW2({
    box1_wages: '176100.00',
    box3_ss_wages: '176100.00',
    box4_ss_tax: '10918.20',
    box5_medicare_wages: '176100.00',
    box6_medicare_tax: (176100 * 0.0145).toFixed(2),
  });
  assert.deepEqual(codes(fields), []);
});

test('an unreadable year disables the cap check and says so, rather than assuming a year', () => {
  const found = codes(goodW2({ tax_year: null }));
  assert.ok(found.includes('unknown-tax-year'));
  assert.ok(!found.includes('ss-wage-base-exceeded'));
});

test('a currency symbol that survived the prompt is reported', () => {
  assert.deepEqual(codes(goodW2({ box1_wages: '$27,720.00' })), ['bad-amount-format']);
});

test('prose in a money box is reported rather than read as zero', () => {
  assert.deepEqual(codes(goodW2({ box10_dependent_care: 'see attached' })), ['bad-amount-format']);
});

test('a box 12 code the IRS does not define is flagged', () => {
  // "0" for "D" and "8" for "B" are the classic OCR confusions this catches.
  assert.deepEqual(codes(goodW2({ box12: [{ code: '0', amount: '1280.00' }] })), [
    'unknown-box12-code',
  ]);
});

test('a real box 12 code is left alone, including the two-letter ones', () => {
  assert.deepEqual(codes(goodW2({ box12: [{ code: 'DD', amount: '9100.00' }] })), []);
});

test('wages below Box 1 warn but are treated as weak evidence', () => {
  const fields = goodW2({ box3_ss_wages: '20000.00', box4_ss_tax: '1240.00' });
  const found = codes(fields);
  assert.ok(found.includes('ss-wages-below-box1'));

  // Weak evidence must barely move confidence -- an employee over the wage base is legitimately
  // in this state, and penalising it hard would bury real readings.
  const adjusted = applyPenalties({ box3_ss_wages: 0.9 }, validate(fields));
  assert.ok(adjusted.box3_ss_wages! > 0.8, `expected a light penalty, got ${adjusted.box3_ss_wages}`);
});

test('an arithmetic failure cuts confidence hard', () => {
  const fields = goodW2({ box4_ss_tax: '198.00' });
  const adjusted = applyPenalties({ box4_ss_tax: 0.9 }, validate(fields));
  assert.ok(adjusted.box4_ss_tax! < 0.4, `expected a heavy penalty, got ${adjusted.box4_ss_tax}`);
});

test('a validator never changes the value it complains about', () => {
  const fields = goodW2({ box4_ss_tax: '198.00' });
  const before = fields.box4_ss_tax;
  validate(fields);
  assert.equal(fields.box4_ss_tax, before);
});

test('missing values are not disagreements', () => {
  // Half a pair proves nothing; the check must skip rather than invent a mismatch.
  assert.deepEqual(codes(goodW2({ box4_ss_tax: null })), []);
  assert.deepEqual(codes(goodW2({ box3_ss_wages: null, box4_ss_tax: null })), []);
});

test('an all-null document produces no warnings', () => {
  // A failed read is not a malformed read. The scorer, not the validators, is what punishes it.
  assert.deepEqual(codes(emptyFields()), []);
});

test('SSN and EIN never survive into an output payload', () => {
  const redacted = redactForOutput(goodW2());
  assert.equal(redacted.employee_ssn, null);
  assert.equal(redacted.employer_ein, null);
  assert.equal(redacted.employee_name, 'MARIA REYES');
  assert.ok(!JSON.stringify(redacted).includes('900-99-1234'));
  assert.ok(!JSON.stringify(redacted).includes('12-3456789'));
});

test('the schema round-trips a fixture without loss', () => {
  const fields = goodW2();
  assert.deepEqual(W2Fields.parse(JSON.parse(JSON.stringify(fields))), fields);
});

test('normalising money keeps a misplaced decimal visible instead of smoothing it', () => {
  assert.equal(normalizeAmount('$27,720.00'), '27720.00');
  assert.equal(normalizeAmount('27720'), '27720.00');
  assert.equal(normalizeAmount('2720.00'), '2720.00');
  assert.equal(normalizeAmount('(450.00)'), '-450.00');
  assert.equal(normalizeAmount('0'), '0.00');
});

test('a money field with no digits is null, never zero', () => {
  // Zero is a real W-2 value. "N/A" must not become indistinguishable from a correctly read 0.00.
  assert.equal(normalizeAmount('N/A'), null);
  assert.equal(normalizeAmount(''), null);
  assert.notEqual(normalizeAmount('0.00'), null);
});

test('names keep their accents through normalisation', () => {
  assert.equal(normalizeText('José García-Piñedo'), 'JOSÉ GARCÍA PIÑEDO');
});

test('a year is recognised however the engine wrapped it', () => {
  assert.equal(normalizeYear('2025'), '2025');
  assert.equal(normalizeYear('Tax year 2025'), '2025');
  assert.equal(normalizeYear(null), null);
});

test('agreement is numeric for money and textual for everything else', () => {
  assert.ok(valuesAgree('box1_wages', '1234', '1234.00', true));
  assert.ok(!valuesAgree('box1_wages', '1234', '1243.00', true));
  assert.ok(valuesAgree('employer_name', 'Atlas Home Care, Inc.', 'ATLAS HOME CARE INC', false));
  assert.ok(valuesAgree('employee_ssn', '900991234', '900-99-1234', false));
});
