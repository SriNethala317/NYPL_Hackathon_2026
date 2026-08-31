import { reconcile, resolveField, unresolved, type FieldCandidate } from './reconcile';

import type { DocumentTypeId } from './document-types';
import type { ProfileFieldKey } from './profile-fields';

let clock = 0;
function candidate(
  field: ProfileFieldKey,
  value: string,
  documentType: DocumentTypeId,
  overrides: Partial<FieldCandidate> = {},
): FieldCandidate {
  clock += 1;
  return {
    field,
    value,
    documentType,
    documentId: `${documentType}-${clock}`,
    confidence: 0.9,
    readAt: clock,
    ...overrides,
  };
}

describe('authority', () => {
  it('prefers a passport over a pay stub for legal name', () => {
    const result = resolveField('fullName', [
      candidate('fullName', 'Maria R. Reyes', 'pay_stub'),
      candidate('fullName', 'Maria Reyes', 'passport'),
    ]);

    expect(result?.value).toBe('Maria Reyes');
    // Precedence settled it, so there is nothing to ask about.
    expect(result?.conflicts).toEqual([]);
  });

  it('prefers a recent utility bill over a photo ID for address', () => {
    // An ID proves who you are, not where you live now.
    const result = resolveField('address', [
      candidate('address', '12 Old Street, Bronx, NY 10456', 'state_id'),
      candidate('address', '1240 Grand Concourse, Bronx, NY 10456', 'utility_bill'),
    ]);

    expect(result?.value).toBe('1240 Grand Concourse, Bronx, NY 10456');
  });

  it('prefers a tax return over a W-2 over a pay stub for income', () => {
    const result = resolveField('income', [
      candidate('income', '2100', 'pay_stub'),
      candidate('income', '2400', 'w2'),
      candidate('income', '2310', 'tax_return'),
    ]);

    expect(result?.value).toBe('2310');
  });

  it('ignores a document that cannot speak to the field', () => {
    // A lease says nothing about a legal name, and must not win it by being recent.
    const result = resolveField('fullName', [
      candidate('fullName', 'Maria Reyes', 'passport'),
      candidate('fullName', 'WRONG', 'lease', { readAt: 9999 }),
    ]);

    expect(result?.value).toBe('Maria Reyes');
  });

  it('returns null when nothing can supply the field', () => {
    expect(resolveField('household', [])).toBeNull();
    expect(resolveField('household', [candidate('household', '3', 'passport')])).toBeNull();
  });
});

describe('ties', () => {
  it('breaks an authority tie by recency', () => {
    const older = candidate('income', '2000', 'pay_stub', { readAt: 1 });
    const newer = candidate('income', '2500', 'pay_stub', { readAt: 2 });

    expect(resolveField('income', [older, newer])?.value).toBe('2500');
  });

  it('breaks a recency tie by confidence', () => {
    const blurry = candidate('income', '2000', 'pay_stub', { readAt: 5, confidence: 0.4 });
    const clear = candidate('income', '2500', 'pay_stub', { readAt: 5, confidence: 0.95 });

    expect(resolveField('income', [blurry, clear])?.value).toBe('2500');
  });
});

describe('conflicts', () => {
  it('asks when two equally authoritative documents disagree on a stable field', () => {
    // Two identity documents disagreeing means an OCR error or a different person.
    const result = resolveField('dob', [
      candidate('dob', '04/18/1991', 'passport'),
      candidate('dob', '04/18/1919', 'passport'),
    ]);

    expect(result?.conflicts).toHaveLength(1);
    expect(unresolved([result!])).toHaveLength(1);
  });

  it('does not ask when a newer document supersedes on a time-varying field', () => {
    // People move and their pay changes. Two different addresses is normal, not a conflict.
    const result = resolveField('address', [
      candidate('address', '12 Old Street', 'utility_bill', { readAt: 1 }),
      candidate('address', '1240 Grand Concourse', 'utility_bill', { readAt: 2 }),
    ]);

    expect(result?.value).toBe('1240 Grand Concourse');
    expect(result?.conflicts).toEqual([]);
  });

  it('does not treat a differently-formatted identical value as a conflict', () => {
    const result = resolveField('fullName', [
      candidate('fullName', 'Maria Reyes', 'passport'),
      candidate('fullName', '  maria   reyes ', 'passport'),
    ]);

    expect(result?.conflicts).toEqual([]);
  });

  it('does not treat formatted money as a conflict', () => {
    const result = resolveField('income', [
      candidate('income', '$2,310', 'w2'),
      candidate('income', '2310', 'w2'),
    ]);

    expect(result?.conflicts).toEqual([]);
  });

  it('does not conflict across different authority tiers', () => {
    const result = resolveField('fullName', [
      candidate('fullName', 'Maria Reyes', 'passport'),
      candidate('fullName', 'Maria R. Reyes', 'w2'),
    ]);

    expect(result?.conflicts).toEqual([]);
  });
});

describe('empty values', () => {
  it('ignores blank extractions rather than letting them win', () => {
    // A model returning "" must never blank out a good value.
    const result = resolveField('fullName', [
      candidate('fullName', '   ', 'passport', { readAt: 99 }),
      candidate('fullName', 'Maria Reyes', 'w2'),
    ]);

    expect(result?.value).toBe('Maria Reyes');
  });
});

describe('reconcile', () => {
  it('resolves every field present across a set of documents', () => {
    const results = reconcile([
      candidate('fullName', 'Maria Reyes', 'passport'),
      candidate('dob', '04/18/1991', 'passport'),
      candidate('address', '1240 Grand Concourse', 'utility_bill'),
      candidate('income', '2310', 'w2'),
      candidate('household', '3', 'tax_return'),
    ]);

    expect(results.map((r) => r.field).sort()).toEqual([
      'address',
      'dob',
      'fullName',
      'household',
      'income',
    ]);
    expect(unresolved(results)).toEqual([]);
  });

  it('records which document each winning value came from', () => {
    // Provenance is shown on the form, so it has to survive the merge.
    const passport = candidate('fullName', 'Maria Reyes', 'passport');
    const [result] = reconcile([passport]);

    expect(result.documentId).toBe(passport.documentId);
    expect(result.documentType).toBe('passport');
  });
});
