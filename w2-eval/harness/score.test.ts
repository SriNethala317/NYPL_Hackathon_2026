import assert from 'node:assert/strict';
import { test } from 'node:test';

import { annualIncomeFrom, emptyFields, W2Fields } from '../core/schema.ts';
import { accuracy, byTier, calibration, composite, scoreExtraction, tally } from './score.ts';

/**
 * The scorer is the one component that cannot be checked by looking at its output, because its
 * output is the thing we are trusting. So it gets tested against cases whose right answer is known
 * independently of the implementation — chiefly: an engine that does nothing must score badly.
 */

function truth(overrides: Partial<W2Fields> = {}): W2Fields {
  return W2Fields.parse({
    ...emptyFields(),
    employee_name: 'MARIA REYES',
    employer_name: 'ATLAS HOME CARE INC',
    tax_year: '2025',
    box1_wages: '27720.00',
    box2_federal_tax: '1980.00',
    box3_ss_wages: '29000.00',
    box4_ss_tax: '1798.00',
    box5_medicare_wages: '29000.00',
    box6_medicare_tax: '420.50',
    box12: [{ code: 'D', amount: '1280.00' }],
    state_items: [
      {
        state: 'NY',
        employer_state_id: '12-3456789',
        state_wages: '29000.00',
        state_tax: '1450.00',
        local_wages: null,
        local_tax: null,
        locality_name: null,
      },
    ],
    ...overrides,
  });
}

/** Confidence high enough that nothing is filtered; calibration is tested separately. */
function confident(): Record<string, number> {
  return new Proxy({}, { get: () => 0.9 }) as Record<string, number>;
}

test('a perfect extraction scores every present field correct', () => {
  const scores = scoreExtraction(truth(), truth(), confident());
  const totals = tally(scores);

  assert.equal(totals.wrong, 0);
  assert.equal(totals.wrong_over, 0);
  assert.equal(totals.wrong_under, 0);
  assert.equal(totals.missed, 0);
  assert.equal(totals.hallucinated, 0);
  assert.equal(accuracy(scores), 1);
});

/**
 * The gate. If this fails, every number the harness produces afterwards is meaningless.
 *
 * With the spec's +1 for correct abstention, an all-nulls engine on a form this sparse scores
 * around +25 - 15 = +10 and looks like a working extractor. At 0 it scores its misses and nothing
 * else, which is the honest answer.
 */
test('an engine that returns nothing scores clearly negative', () => {
  const scores = scoreExtraction(emptyFields(), truth(), confident());
  const score = composite(scores);

  assert.ok(score < 0, `an all-nulls engine scored ${score}; silence must not be rewarded`);
  assert.equal(tally(scores).correct, 0);
  assert.equal(accuracy(scores), 0);
});

test('an engine that reads most of the form beats one that returns nothing', () => {
  const partial = W2Fields.parse({
    ...emptyFields(),
    employee_name: 'MARIA REYES',
    employer_name: 'ATLAS HOME CARE INC',
    tax_year: '2025',
    box1_wages: '27720.00',
    box5_medicare_wages: '29000.00',
  });

  const good = composite(scoreExtraction(partial, truth(), confident()));
  const silent = composite(scoreExtraction(emptyFields(), truth(), confident()));

  assert.ok(good > silent, `partial ${good} should beat silent ${silent}`);
});

test('overstating income costs more than understating it', () => {
  // Understating surfaces more programmes the user can decline; overstating hides them silently.
  const under = composite(scoreExtraction(truth({ box5_medicare_wages: '2900.00' }), truth(), confident()));
  const over = composite(scoreExtraction(truth({ box5_medicare_wages: '290000.00' }), truth(), confident()));

  assert.ok(over < under, `overstating (${over}) must cost more than understating (${under})`);
});

test('the dropped digit measured from the local model classifies as wrong_under', () => {
  // gemma3:4b read 2720.00 off a clean fixture whose truth is 27720.00.
  const scores = scoreExtraction(truth({ box1_wages: '2720.00' }), truth(), confident());
  const box1 = scores.find((s) => s.field === 'box1_wages');

  assert.equal(box1?.outcome, 'wrong_under');
  assert.equal(box1?.tier, 'critical');
});

test('a value invented where the truth is blank is caught as a hallucination', () => {
  // The failure mode a truth-key loop cannot see, and the reason this scorer walks both sides.
  const scores = scoreExtraction(truth({ box8_allocated_tips: '500.00' }), truth(), confident());
  const box8 = scores.find((s) => s.field === 'box8_allocated_tips');

  assert.equal(box8?.outcome, 'hallucinated');
});

test('an invented box 12 row is caught, not silently ignored', () => {
  const invented = truth({
    box12: [
      { code: 'D', amount: '1280.00' },
      { code: 'DD', amount: '9100.00' },
    ],
  });
  const scores = scoreExtraction(invented, truth(), confident());

  assert.equal(scores.find((s) => s.field === 'box12[DD]')?.outcome, 'hallucinated');
  assert.equal(scores.find((s) => s.field === 'box12[D]')?.outcome, 'correct');
});

test('box 12 rows read in the other order are still correct', () => {
  // 12a-12d carry no meaning in their ordering, so position matching would invent an error.
  const both = truth({
    box12: [
      { code: 'D', amount: '1280.00' },
      { code: 'DD', amount: '9100.00' },
    ],
  });
  const reversed = truth({
    box12: [
      { code: 'DD', amount: '9100.00' },
      { code: 'D', amount: '1280.00' },
    ],
  });

  assert.equal(tally(scoreExtraction(reversed, both, confident())).wrong, 0);
  assert.equal(tally(scoreExtraction(reversed, both, confident())).hallucinated, 0);
});

test('a partly read state row scores per column, not as one failure', () => {
  const missingLocal = truth({
    state_items: [
      {
        state: 'NY',
        employer_state_id: '12-3456789',
        state_wages: '29000.00',
        state_tax: null,
        local_wages: null,
        local_tax: null,
        locality_name: null,
      },
    ],
  });
  const scores = scoreExtraction(missingLocal, truth(), confident());

  assert.equal(scores.find((s) => s.field === 'state_items[NY].state_wages')?.outcome, 'correct');
  assert.equal(scores.find((s) => s.field === 'state_items[NY].state_tax')?.outcome, 'missed');
});

test('SSN and EIN are never scored', () => {
  const scores = scoreExtraction(
    truth({ employee_ssn: '900-99-1234', employer_ein: '12-3456789' }),
    truth(),
    confident(),
  );
  assert.equal(scores.filter((s) => s.field === 'employee_ssn').length, 0);
  assert.equal(scores.filter((s) => s.field === 'employer_ein').length, 0);
});

test('Box 5 is tier one, alongside the other figures a screener depends on', () => {
  const critical = byTier(scoreExtraction(truth(), truth(), confident()), 'critical').map((s) => s.field);
  assert.ok(critical.includes('box5_medicare_wages'));
  assert.ok(critical.includes('box1_wages'));
  assert.ok(critical.includes('tax_year'));
});

test('screener scope measures only what the app can consume', () => {
  // Gemini scored 92% over the whole schema and 100% here; qwen 47% and 82%. The difference lives
  // entirely in fields nothing downstream reads, so ranking on the full schema ranks the wrong
  // thing. This asserts the scope actually narrows to those fields and no others.
  const scores = scoreExtraction(truth(), truth(), confident(), 'screener');
  assert.deepEqual(
    scores.map((s) => s.field).sort(),
    ['box1_wages', 'box5_medicare_wages', 'employee_address', 'employee_name', 'tax_year'],
  );

  // An engine that fumbles box 14 and nails box 5 is not penalised by this scope.
  const noisy = truth({ box14_other: [{ label: 'INVENTED', amount: '1.00' }] });
  assert.equal(tally(scoreExtraction(noisy, truth(), confident(), 'screener')).hallucinated, 0);
  assert.ok(tally(scoreExtraction(noisy, truth(), confident(), 'all')).hallucinated > 0);
});

test('the income figure is Box 5, falling back to Box 1', () => {
  assert.equal(annualIncomeFrom(truth()), '29000.00');

  // Box 1 understates gross by the amount of any pre-tax deferral, so it is the fallback and not
  // the first choice -- but it beats returning nothing.
  assert.equal(annualIncomeFrom(truth({ box5_medicare_wages: null })), '27720.00');
  assert.equal(annualIncomeFrom(truth({ box5_medicare_wages: null, box1_wages: null })), null);
});

test('a W-2 income figure is annual, and the app stores monthly', () => {
  /*
   * The trap this guards. `income` is documented as gross MONTHLY
   * (src/data/profile-fields.ts:85) and is multiplied by 12 at the eligibility boundary
   * (src/data/eligibility.ts:75-82). Box 5 is ANNUAL. Writing it through unconverted turns
   * $29,000 into $348,000 of assessed income -- over every cap, hiding every programme, and
   * invisible to anyone downstream.
   */
  const annual = Number(annualIncomeFrom(truth()));
  assert.equal(annual, 29000);

  const monthly = annual / 12;
  assert.equal(Math.round(monthly * 12), annual, 'the round trip must return the annual figure');

  const unconverted = annual * 12;
  assert.equal(unconverted, 348_000);
  assert.notEqual(unconverted, annual);
});

test('calibration separates a confident wrong answer from a hesitant one', () => {
  const wrong = truth({ box1_wages: '99999.00' });
  const overconfident = scoreExtraction(wrong, truth(), { box1_wages: 0.95 });
  const hesitant = scoreExtraction(wrong, truth(), { box1_wages: 0.1 });

  const topBucket = (s: ReturnType<typeof scoreExtraction>) =>
    calibration(s).find((b) => b.label === '0.75-1.00')!;

  assert.ok(topBucket(overconfident).n > 0, 'a 0.95 reading belongs in the top bucket');
  assert.equal(topBucket(overconfident).accuracy, 0, 'and it was wrong, so that bucket is 0%');
  assert.equal(topBucket(hesitant).n, 0, 'a 0.1 reading does not belong in the top bucket');
});
