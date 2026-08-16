import { programs, criteriaFor, incomeLimitFor } from './catalogue';
import { ageFromDob, evaluate, evaluateAll, monthlyToAnnual, toVisualStatus } from './eligibility';

import type { DocumentCategory } from '@/theme';

const ALL_PROOF: DocumentCategory[] = ['identity', 'income', 'residence', 'immigration', 'other'];

/** Fair Fares is the richest rule set in the catalogue, so it exercises every branch. */
const fairFares = programs.find((p) => /fair fares/i.test(p.name))!;

describe('monthlyToAnnual', () => {
  it('multiplies by twelve', () => {
    expect(monthlyToAnnual(2310)).toBe(27_720);
    expect(monthlyToAnnual('$2,310')).toBe(27_720);
  });

  it('returns undefined rather than NaN', () => {
    // NaN would compare false against every limit and silently read as "eligible".
    expect(monthlyToAnnual('abc')).toBeUndefined();
    expect(monthlyToAnnual(0)).toBeUndefined();
  });
});

describe('ageFromDob', () => {
  it('reads a MM/DD/YYYY date', () => {
    const age = ageFromDob('04/18/1991');
    expect(age).toBeGreaterThan(30);
    expect(age).toBeLessThan(45);
  });

  it('has not counted a birthday that has not happened yet', () => {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const dob = `${tomorrow.getMonth() + 1}/${tomorrow.getDate()}/2000`;
    expect(ageFromDob(dob)).toBe(now.getFullYear() - 2000 - 1);
  });

  it('rejects unparseable input rather than guessing', () => {
    expect(ageFromDob(undefined)).toBeUndefined();
    expect(ageFromDob('not a date')).toBeUndefined();
    expect(ageFromDob('1991-04-18')).toBeUndefined();
  });
});

describe('evaluate', () => {
  it('declines to screen a program whose rules we could not parse', () => {
    const unscorable = programs.find((p) => !criteriaFor(p.id)?.scorable);
    expect(unscorable).toBeDefined();

    const result = evaluate(unscorable!.id, { categoriesOnFile: ALL_PROOF });
    // We are not entitled to an opinion here. Saying "may not qualify" would be inventing a
    // rejection out of our own parser's limits.
    expect(result.status).toBe('not_screened');
    expect(result.reasons).toEqual([]);
  });

  it('finds a low-income NYC adult potentially eligible for Fair Fares', () => {
    const result = evaluate(fairFares.id, {
      age: 34,
      nycResident: true,
      householdSize: 3,
      annualIncome: 27_720,
      categoriesOnFile: ALL_PROOF,
    });
    expect(result.status).toBe('potentially_eligible');
  });

  it('is only ever "likely" not eligible, and says why', () => {
    const result = evaluate(fairFares.id, {
      age: 34,
      nycResident: true,
      householdSize: 1,
      annualIncome: 200_000,
      categoriesOnFile: ALL_PROOF,
    });

    expect(result.status).toBe('likely_not_eligible');
    const detail = result.reasonDetails.find((d) => d.code === 'income-over-limit');
    expect(detail).toBeDefined();
    // The number applied to the applicant, so it can be shown to them.
    expect(detail!.limit).toBe(23_475);
  });

  it('treats income exactly at the limit as eligible', () => {
    const limit = incomeLimitFor(criteriaFor(fairFares.id)!.criteria, 3)!;
    const result = evaluate(fairFares.id, {
      age: 34,
      nycResident: true,
      householdSize: 3,
      annualIncome: limit,
      categoriesOnFile: ALL_PROOF,
    });
    // An off-by-one here turns away someone sitting exactly on the boundary.
    expect(result.status).toBe('potentially_eligible');
  });

  it('applies the published age bounds', () => {
    const tooYoung = evaluate(fairFares.id, {
      age: 12,
      nycResident: true,
      householdSize: 1,
      annualIncome: 1_000,
      categoriesOnFile: ALL_PROOF,
    });
    expect(tooYoung.reasons).toContain('below-min-age');

    const tooOld = evaluate(fairFares.id, {
      age: 80,
      nycResident: true,
      householdSize: 1,
      annualIncome: 1_000,
      categoriesOnFile: ALL_PROOF,
    });
    expect(tooOld.reasons).toContain('above-max-age');
  });

  it('asks for a missing category of proof instead of failing', () => {
    const result = evaluate(fairFares.id, {
      age: 34,
      nycResident: true,
      householdSize: 3,
      annualIncome: 27_720,
      categoriesOnFile: ['identity'],
    });
    expect(result.status).toBe('needs_more_information');
    expect(result.missingFields.length).toBeGreaterThan(0);
  });

  it('refuses to judge income without a household size', () => {
    const result = evaluate(fairFares.id, {
      age: 34,
      nycResident: true,
      annualIncome: 27_720,
      categoriesOnFile: ALL_PROOF,
    });
    // Reading a bracket table against the wrong household size is worse than no answer.
    expect(result.status).toBe('needs_more_information');
    expect(result.missingFields).toContain('household');
    expect(result.reasons).toEqual([]);
  });

  it('does not treat unknown residency as non-residency', () => {
    // Absence of an address is missing information, never evidence someone lives elsewhere.
    const result = evaluate(fairFares.id, {
      age: 34,
      householdSize: 3,
      annualIncome: 27_720,
      categoriesOnFile: ALL_PROOF,
    });
    expect(result.reasons).not.toContain('not-nyc-resident');
  });

  it('returns a usable result for an unknown program id', () => {
    const result = evaluate('nonexistent', { categoriesOnFile: [] });
    expect(result.status).toBe('not_screened');
  });
});

describe('evaluateAll', () => {
  it('returns one result per catalogue program', () => {
    const results = evaluateAll({ categoriesOnFile: [] });
    expect(results).toHaveLength(programs.length);
  });

  it('surfaces something actionable for a fully described applicant', () => {
    const results = evaluateAll({
      age: 34,
      nycResident: true,
      householdSize: 3,
      annualIncome: 27_720,
      categoriesOnFile: ALL_PROOF,
    });
    expect(results.some((r) => r.status === 'potentially_eligible')).toBe(true);
  });
});

describe('toVisualStatus', () => {
  it('maps engine vocabulary onto theme tokens', () => {
    expect(toVisualStatus('potentially_eligible')).toBe('yes');
    expect(toVisualStatus('needs_more_information')).toBe('more');
    expect(toVisualStatus('likely_not_eligible')).toBe('no');
  });

  it('shows an unscreened program as needing more info, never as a rejection', () => {
    expect(toVisualStatus('not_screened')).toBe('more');
  });
});

/**
 * Regressions from the adversarial QA pass. Each of these was a real way to produce a
 * confident, wrong answer for somebody applying for benefits.
 */
describe('hostile input', () => {
  it('treats an unparseable household size as unknown, not as one person', () => {
    // Number("abc") is NaN, which is not undefined, so it slipped past the "ask for household"
    // branch and then became a household of 1 -- the strictest bracket in the table. A family
    // was being told they do not qualify on the strength of a typo.
    const result = evaluate(fairFares.id, {
      age: 34,
      nycResident: true,
      householdSize: Number('abc'),
      annualIncome: 60_000,
      categoriesOnFile: ALL_PROOF,
    });

    expect(result.status).toBe('needs_more_information');
    expect(result.missingFields).toContain('household');
    expect(result.reasons).not.toContain('income-over-limit');
  });

  it('treats an unparseable income as unknown', () => {
    const result = evaluate(fairFares.id, {
      age: 34,
      nycResident: true,
      householdSize: 3,
      annualIncome: Number('nonsense'),
      categoriesOnFile: ALL_PROOF,
    });
    expect(result.missingFields).toContain('income');
    expect(result.reasons).toEqual([]);
  });

  it('ignores a NaN age rather than comparing it to the bounds', () => {
    const result = evaluate(fairFares.id, {
      age: Number('x'),
      nycResident: true,
      householdSize: 3,
      annualIncome: 27_720,
      categoriesOnFile: ALL_PROOF,
    });
    expect(result.reasons).not.toContain('below-min-age');
    expect(result.reasons).not.toContain('above-max-age');
    expect(result.missingFields).toContain('dob');
  });

  it('rejects dates that do not exist instead of rolling them over', () => {
    // JS Date never returns Invalid Date for these -- it silently reinterprets them, producing
    // a plausible age from a date the person never had.
    expect(ageFromDob('13/01/2000')).toBeUndefined();
    expect(ageFromDob('01/32/2000')).toBeUndefined();
    expect(ageFromDob('02/29/2001')).toBeUndefined();
  });

  it('still accepts a real leap day', () => {
    expect(ageFromDob('02/29/2000')).toBeGreaterThan(20);
  });

  it('does not let an enormous income overflow to Infinity', () => {
    expect(monthlyToAnnual(1e308)).toBeUndefined();
  });
});
