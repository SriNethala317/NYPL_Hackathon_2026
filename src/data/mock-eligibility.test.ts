import {
  evaluate,
  evaluateAll,
  isDocumentCategory,
  isProfileFieldKey,
  limitFromReason,
  monthlyToAnnual,
  toVisualStatus,
} from './mock-eligibility';
import { programById } from './programs';

import type { DocumentCategory } from '@/theme';

/** Every kind of proof on file. */
const allDocs: DocumentCategory[] = ['identity', 'income', 'residence'];

describe('monthlyToAnnual', () => {
  it('multiplies by twelve', () => {
    expect(monthlyToAnnual(2310)).toBe(27_720);
    expect(monthlyToAnnual('2310')).toBe(27_720);
  });

  it('tolerates currency formatting from a text field', () => {
    expect(monthlyToAnnual('$2,310')).toBe(27_720);
  });

  it('returns undefined rather than NaN for unusable input', () => {
    // A NaN reaching the engine would silently compare false and read as "eligible".
    expect(monthlyToAnnual('')).toBeUndefined();
    expect(monthlyToAnnual('abc')).toBeUndefined();
    expect(monthlyToAnnual(0)).toBeUndefined();
    expect(monthlyToAnnual(-5)).toBeUndefined();
  });
});

describe('toVisualStatus', () => {
  it('maps engine vocabulary onto theme token keys', () => {
    expect(toVisualStatus('potentially_eligible')).toBe('yes');
    expect(toVisualStatus('needs_more_information')).toBe('more');
    expect(toVisualStatus('likely_not_eligible')).toBe('no');
  });
});

describe('evaluate', () => {
  it('is potentially eligible when documents are on file and income is under the limit', () => {
    const result = evaluate('fair_fares', {
      householdSize: 3,
      annualIncome: 27_720,
      categoriesOnFile: allDocs,
    });

    expect(result.status).toBe('potentially_eligible');
    expect(result.reasons).toEqual([]);
    expect(result.missingFields).toEqual([]);
  });

  it('reports the specific missing document rather than a generic failure', () => {
    const result = evaluate('snap', {
      householdSize: 3,
      annualIncome: 27_720,
      categoriesOnFile: ['identity', 'income'],
    });

    expect(result.status).toBe('needs_more_information');
    expect(result.missingFields).toContain('residence');
  });

  it('is only ever "likely" not eligible, never a determination', () => {
    const result = evaluate('fair_fares', {
      householdSize: 1,
      annualIncome: 90_000,
      categoriesOnFile: allDocs,
    });

    // The app screens; the agency decides. This wording is load-bearing.
    expect(result.status).toBe('likely_not_eligible');
    expect(result.reasons).toHaveLength(1);
  });

  it('treats income exactly at the limit as eligible', () => {
    const limit = programById('fair_fares').annualIncomeLimit(3);
    const result = evaluate('fair_fares', {
      householdSize: 3,
      annualIncome: limit,
      categoriesOnFile: allDocs,
    });

    // An off-by-one here would wrongly turn away someone right on the boundary.
    expect(result.status).toBe('potentially_eligible');
  });

  it('refuses to judge income when household size is unknown', () => {
    const result = evaluate('fair_fares', {
      householdSize: undefined,
      annualIncome: 27_720,
      categoriesOnFile: allDocs,
    });

    // A limit read against the wrong household size is worse than no answer.
    expect(result.status).toBe('needs_more_information');
    expect(result.missingFields).toContain('household');
    expect(result.reasons).toEqual([]);
  });

  it('does not ask for income before the documents that supply it', () => {
    const result = evaluate('fair_fares', { categoriesOnFile: [] });

    expect(result.missingFields).toContain('identity');
    expect(result.missingFields).not.toContain('household');
  });

  it('carries the rule source through, so the UI can show when it was last checked', () => {
    const result = evaluate('fair_fares', { categoriesOnFile: allDocs });
    expect(result.source.url).toMatch(/^https:\/\//);
    expect(result.source.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('evaluateAll', () => {
  it('returns one result per program', () => {
    const results = evaluateAll({ categoriesOnFile: allDocs });
    expect(results.map((r) => r.programId).sort()).toEqual(['fair_fares', 'medicaid', 'snap']);
  });

  it('places a realistic low-income household within every income limit', () => {
    // Maria Reyes from the design: household 3, $2,310/mo. With the real annual limits she
    // qualifies everywhere -- the design's "Medicaid: not eligible" demo relied on a cap that
    // does not exist. See docs/architecture-review.md.
    const results = evaluateAll({
      householdSize: 3,
      annualIncome: monthlyToAnnual(2310),
      categoriesOnFile: allDocs,
    });

    expect(results.every((r) => r.status === 'potentially_eligible')).toBe(true);
  });
});

describe('reason codes', () => {
  it('round-trips the limit through the reason string', () => {
    const result = evaluate('medicaid', {
      householdSize: 3,
      annualIncome: 500_000,
      categoriesOnFile: allDocs,
    });

    const limit = limitFromReason(result.reasons[0]);
    expect(limit).toBe(programById('medicaid').annualIncomeLimit(3));
  });

  it('returns null for anything that is not a limit reason', () => {
    expect(limitFromReason('some-other-reason')).toBeNull();
    expect(limitFromReason('income-over-limit:')).toBeNull();
  });
});

describe('missingFields discrimination', () => {
  it('separates proof categories from profile fields', () => {
    expect(isDocumentCategory('residence')).toBe(true);
    expect(isDocumentCategory('household')).toBe(false);
    expect(isProfileFieldKey('household')).toBe(true);
    expect(isProfileFieldKey('residence')).toBe(false);
  });

  it('classifies every field the engine can emit', () => {
    const result = evaluate('snap', { categoriesOnFile: [] });
    for (const field of result.missingFields) {
      expect(isDocumentCategory(field) || isProfileFieldKey(field)).toBe(true);
    }
  });
});
