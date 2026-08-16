import { formatUsd, programById, programs } from './programs';

describe('Fair Fares income limits', () => {
  const limit = (size: number) => programById('fair_fares').annualIncomeLimit(size);

  it('matches the published 2026 brackets', () => {
    expect(limit(1)).toBe(23_940);
    expect(limit(3)).toBe(40_980);
    expect(limit(8)).toBe(83_580);
  });

  it('extrapolates past eight people at the stated increment', () => {
    expect(limit(9)).toBe(83_580 + 8_520);
    expect(limit(12)).toBe(83_580 + 4 * 8_520);
  });

  it('rises monotonically with household size', () => {
    // A bracket table that ever dips would deny a larger household on a smaller income.
    for (let size = 2; size <= 15; size++) {
      expect(limit(size)).toBeGreaterThan(limit(size - 1));
    }
  });

  it('treats nonsense household sizes as a household of one', () => {
    expect(limit(0)).toBe(limit(1));
    expect(limit(-3)).toBe(limit(1));
    expect(limit(NaN)).toBe(limit(1));
    expect(limit(2.7)).toBe(limit(2));
  });
});

describe('programs', () => {
  it('gives every program a verifiable source', () => {
    for (const program of programs) {
      expect(program.source.url).toMatch(/^https:\/\//);
      expect(program.source.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('requires photo ID for every program', () => {
    // The pipeline gates on ID before anything else; nothing should be applicable without it.
    for (const program of programs) {
      expect(program.requires).toContain('id');
    }
  });

  it('throws loudly on an unknown id rather than returning undefined', () => {
    // @ts-expect-error deliberately invalid
    expect(() => programById('not_a_program')).toThrow(/Unknown program/);
  });
});

describe('formatUsd', () => {
  it('formats without cents', () => {
    expect(formatUsd(40_980)).toBe('$40,980');
    expect(formatUsd(0)).toBe('$0');
  });
});
