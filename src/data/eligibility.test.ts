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

/**
 * Regressions from the independent eligibility audit. Each of these was the app confidently
 * telling somebody they did not qualify for a benefit they were entitled to.
 */
describe('partial readings never produce a rejection', () => {
  it('never says "likely not eligible" for a programme we only partly understand', () => {
    // Half the catalogue offers alternative routes -- "65 or older, OR legally blind, OR deaf" --
    // or turns on something we never ask about. Applying the one branch we parsed as if it were
    // the whole test told a forty-year-old blind rider they did not qualify for a reduced fare.
    const partial = programs.filter((p) => criteriaFor(p.id)?.partial);
    expect(partial.length).toBeGreaterThan(0);

    for (const program of partial) {
      const result = evaluate(program.id, {
        age: 40,
        nycResident: true,
        householdSize: 1,
        annualIncome: 500_000,
        categoriesOnFile: ALL_PROOF,
      });
      expect(result.status).not.toBe('likely_not_eligible');
    }
  });

  it('still explains what did not match, without calling it a verdict', () => {
    const mta = programs.find((p) => /reduced.fare/i.test(p.name));
    if (!mta) return;

    const result = evaluate(mta.id, {
      age: 40,
      nycResident: true,
      categoriesOnFile: ALL_PROOF,
    });
    expect(result.status).toBe('needs_more_information');
    expect(result.partial).toBe(true);
  });
});

describe('criteria faithfully reflect the official text', () => {
  it('reads monthly income tables as monthly', () => {
    // HEAP publishes "Maximum Monthly Gross Income". Storing $3,322 in the annual field made the
    // limit twelve times too strict -- someone on $1,800 a month was refused heating assistance.
    const heap = programs.find((p) => /home energy assistance/i.test(p.name));
    const table = criteriaFor(heap!.id)?.criteria.annualIncomeByHouseholdSize;

    expect(table).toBeDefined();
    // An annual figure for a single-person household cannot plausibly be four figures.
    expect(table!['1']).toBeGreaterThan(20_000);
  });

  it('never applies a dependant’s age to the applicant', () => {
    // FHEPS says "your family must have a child under 18". That became maxAge 17 on the adult
    // filling in the form, so every real parent facing eviction was told they did not qualify.
    const fheps = programs.find((p) => /family homelessness and eviction/i.test(p.name));
    expect(criteriaFor(fheps!.id)?.criteria.maxAge).toBeUndefined();
  });

  it('does not mistake an investment-income sub-limit for the household limit', () => {
    // EITC caps investment income at $11,950 while household limits run to $68,675.
    const eitc = programs.find((p) => /earned income tax credit/i.test(p.name));
    expect(criteriaFor(eitc!.id)?.criteria.annualIncomeCap).not.toBe(11_950);
  });

  it('reads an income cap phrased as "$X or less"', () => {
    // DRIE says "$50,000 or less per year". The qualifier trails the figure, which the original
    // pattern could not see, so the cap was silently absent.
    const drie = programs.find((p) => /disability rent increase/i.test(p.name));
    expect(criteriaFor(drie!.id)?.criteria.annualIncomeCap).toBe(50_000);
  });

  it('marks every programme whose rule depends on something we never ask', () => {
    for (const program of programs) {
      const record = criteriaFor(program.id);
      if (record?.unchecked?.length) expect(record.partial).toBe(true);
    }
  });
});
