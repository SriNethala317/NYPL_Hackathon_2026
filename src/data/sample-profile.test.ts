import { sampleProfile } from './sample-profile';

/**
 * The demo applicant comes from `.env`, and must not need to.
 *
 * Two properties matter here and they pull in opposite directions. Somebody demoing the app as
 * themselves should not have to commit their own name, address and date of birth — git keeps a
 * fixture long after the demo is over, including in forks. But the test suite must not depend on
 * what happens to be in a particular machine's `.env` either, or it passes on the author's laptop
 * and fails in CI.
 *
 * Jest does not load `.env`, so these run against the committed fallback. That is the invariant
 * worth pinning: the fallback is a real, complete, invented person, and nothing here is anyone's
 * actual data.
 */
describe('the demo applicant', () => {
  it('is complete without any environment configuration', () => {
    // Every field the app treats as mandatory has to be present, or "Load sample" produces a
    // profile that cannot reach a form and the demo dead-ends.
    expect(sampleProfile.fullName).toBeTruthy();
    expect(sampleProfile.dob).toBeTruthy();
    expect(sampleProfile.address).toBeTruthy();
    expect(sampleProfile.household).toBeTruthy();
    expect(sampleProfile.income).toBeTruthy();
  });

  it('lives in New York, because the whole catalogue screens on it', () => {
    // An out-of-state demo address screens as ineligible for nearly all 97 programmes — correct
    // behaviour that looks exactly like a broken app.
    expect(sampleProfile.address).toMatch(/\bNY\b/);
  });

  it('carries a date of birth the form filler will accept', () => {
    // `applyFormat` rejects anything that is not a real MM/DD/YYYY date rather than writing it
    // verbatim into a box signed under penalty of law.
    expect(sampleProfile.dob).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('derives initials rather than storing them separately', () => {
    // They were a hand-maintained constant, so overriding the name from `.env` left the avatar
    // showing the previous person's letters.
    const words = sampleProfile.fullName.split(/\s+/);
    const expected = (words[0][0] + (words.at(-1) as string)[0]).toUpperCase();
    expect(sampleProfile.initials).toBe(expected);
  });
});
