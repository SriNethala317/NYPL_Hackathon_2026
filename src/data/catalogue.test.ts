import {
  catalogueFetchedAt,
  criteriaFor,
  incomeLimitFor,
  programById,
  programCategories,
  programs,
  scorablePrograms,
} from './catalogue';

/**
 * Guards the generated catalogue.
 *
 * These files come from `scripts/ingest-programs.mjs` and `scripts/derive-criteria.mjs`. If a
 * re-run mangles the shape, or NYC changes the dataset out from under us, this is where it
 * surfaces — rather than as a blank screen in front of somebody trying to apply for food.
 */

describe('the ingested catalogue', () => {
  it('has the full NYC program list', () => {
    expect(programs.length).toBeGreaterThanOrEqual(90);
  });

  it('gives every program an id, a name and a traceable source', () => {
    for (const program of programs) {
      expect(program.id).toBeTruthy();
      expect(program.name).toBeTruthy();
      expect(program.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it('has no duplicate ids', () => {
    const ids = programs.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('records when it was fetched, so staleness is visible', () => {
    expect(catalogueFetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it('strips HTML out of the official text', () => {
    // The City publishes markup; leaving it in would render literal tags to the user.
    for (const program of programs) {
      expect(program.eligibilityText ?? '').not.toMatch(/<\/?[a-z]/i);
      expect(program.summary ?? '').not.toMatch(/<\/?[a-z]/i);
    }
  });

  it('exposes browsable categories', () => {
    const categories = programCategories();
    expect(categories.length).toBeGreaterThan(5);
    expect(categories).toContain('Health');
  });
});

describe('derived criteria', () => {
  it('can score a meaningful share of the catalogue', () => {
    // Honesty check. If this collapses, the heuristics broke and most programs silently became
    // "we could not check this".
    expect(scorablePrograms().length).toBeGreaterThanOrEqual(30);
  });

  it('never marks a program scorable without something to score on', () => {
    for (const program of programs) {
      const record = criteriaFor(program.id);
      if (!record?.scorable) continue;
      const c = record.criteria;
      const hasRule =
        c.nycResident !== undefined ||
        c.minAge !== undefined ||
        c.maxAge !== undefined ||
        c.annualIncomeByHouseholdSize !== undefined ||
        c.annualIncomeCap !== undefined;
      expect(hasRule).toBe(true);
    }
  });

  it('quotes the City for every rule it applies', () => {
    // A person told they may not qualify is entitled to see the sentence that decided it.
    for (const program of programs) {
      const record = criteriaFor(program.id);
      if (!record?.scorable) continue;
      if (record.criteria.nycResident) expect(record.sources.nycResident).toBeTruthy();
      if (record.criteria.minAge !== undefined) expect(record.sources.age).toBeTruthy();
    }
  });

  it('reads the published Fair Fares brackets correctly', () => {
    const fairFares = programs.find((p) => /fair fares/i.test(p.name));
    expect(fairFares).toBeDefined();

    const record = criteriaFor(fairFares!.id);
    const table = record?.criteria.annualIncomeByHouseholdSize;
    expect(table).toBeDefined();
    // Straight from the City's own table, not from anything we invented.
    expect(table!['1']).toBe(23_475);
    expect(table!['3']).toBe(39_975);
    expect(record?.criteria.additionalPersonIncrement).toBe(8_250);
    expect(record?.criteria.minAge).toBe(18);
    expect(record?.criteria.maxAge).toBe(64);
  });
});

describe('incomeLimitFor', () => {
  const table = { '1': 10_000, '2': 20_000, '3': 30_000 };

  it('reads a published bracket directly', () => {
    expect(incomeLimitFor({ annualIncomeByHouseholdSize: table }, 2)).toBe(20_000);
  });

  it('extrapolates past the largest bracket using the stated increment', () => {
    // The agency instructs this; treating a household of 6 as a household of 3 would wrongly
    // deny a large family.
    expect(
      incomeLimitFor({ annualIncomeByHouseholdSize: table, additionalPersonIncrement: 5_000 }, 6),
    ).toBe(30_000 + 3 * 5_000);
  });

  it('holds at the largest bracket when no increment is published', () => {
    expect(incomeLimitFor({ annualIncomeByHouseholdSize: table }, 9)).toBe(30_000);
  });

  it('prefers a flat cap when one exists', () => {
    expect(incomeLimitFor({ annualIncomeCap: 44_000, annualIncomeByHouseholdSize: table }, 2)).toBe(
      44_000,
    );
  });

  it('treats a nonsense household size as one person', () => {
    expect(incomeLimitFor({ annualIncomeByHouseholdSize: table }, 0)).toBe(10_000);
    expect(incomeLimitFor({ annualIncomeByHouseholdSize: table }, NaN)).toBe(10_000);
  });

  it('returns undefined when the program has no income rule', () => {
    expect(incomeLimitFor({}, 3)).toBeUndefined();
  });
});

describe('programById', () => {
  it('returns undefined for an unknown id rather than throwing', () => {
    // Ids arrive from route params, which a user can type. A crash here is a crash on open.
    expect(programById('not-a-real-program')).toBeUndefined();
  });
});
