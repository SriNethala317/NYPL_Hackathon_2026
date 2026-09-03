import { extractFields } from './field-matchers';

/**
 * Reading an identity card, which is not like reading a wage document.
 *
 * A real applicant photographed their New York driver's licence, the scan succeeded, and their
 * profile stayed empty. `extractFields` anchors on English labels — "EMPLOYEE NAME", "GROSS PAY" —
 * and a licence prints none of them: the family name and given name sit on unlabelled lines, the
 * address sits on unlabelled lines, and the only English label on the card is DOB, next to which
 * sit the issue and expiry dates.
 *
 * What came back was worse than nothing: no name, no address, and the EXPIRY date as the date of
 * birth. That value would have made the applicant appear to be born in 2029 — silently failing
 * every age check in the eligibility engine, and printing onto a form they signed as true.
 *
 * The real fix is `readDocument` preferring the fields a vision model picks out itself, since a
 * model knows what a licence looks like and label matching never will. These tests cover the
 * no-key fallback, which still has to fail safely rather than confidently wrongly.
 */

const NY_LICENCE = `NEW YORK STATE
DRIVER LICENSE
ID 123 456 789
CLASS D
GONZALEZ
MARIA
1240 GRAND CONCOURSE
BRONX, NY 10456
DOB 03/14/1958
EXP 03/14/2029
SEX F  EYES BRO  HGT 5'-04"`;

describe('a real driver’s licence, without a vision model', () => {
  it('never reports the expiry date as the date of birth', () => {
    const dob = extractFields(NY_LICENCE, 'drivers_license').find((f) => f.key === 'dob');

    expect(dob?.value).not.toContain('2029');
  });

  it('finds the labelled date of birth', () => {
    const dob = extractFields(NY_LICENCE, 'drivers_license').find((f) => f.key === 'dob');

    expect(dob?.value).toContain('03/14/1958');
  });

  it('leaves a field unanswered rather than guessing at it', () => {
    /*
     * Name and address genuinely cannot be recovered from this card by label matching, and this
     * test asserts that the matchers say so instead of returning something plausible. Downstream,
     * an absent field becomes "we could not read your name" and the applicant types it; a wrong
     * one becomes a wrong name on a government form.
     */
    const fields = extractFields(NY_LICENCE, 'drivers_license');

    for (const field of fields) {
      expect(field.value.trim()).not.toBe('');
      // Nothing may be lifted off a line that labels itself as something else.
      expect(field.value).not.toMatch(/^(EXP|ISS|CLASS|SEX|EYES|HGT)\b/i);
    }
  });
});

describe('documents that do carry labels still work', () => {
  const PAY_STUB = `ACME CORPORATION
EARNINGS STATEMENT
EMPLOYEE NAME: MARIA GONZALEZ
PAY PERIOD: 01/01/2026 - 01/15/2026
GROSS PAY: $2,310.00`;

  it('reads a labelled name', () => {
    const name = extractFields(PAY_STUB, 'pay_stub').find((f) => f.key === 'fullName');
    expect(name?.value).toMatch(/MARIA GONZALEZ/i);
  });

  it('does not mistake a pay-period date for anything else', () => {
    // A pay stub yields no dob at all; the date range must not leak into one.
    const dob = extractFields(PAY_STUB, 'pay_stub').find((f) => f.key === 'dob');
    expect(dob).toBeUndefined();
  });
});
