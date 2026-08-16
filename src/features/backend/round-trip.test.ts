import { authorityRank } from '@/data/document-types';
import { reconcile, resolveField, type FieldCandidate } from '@/data/reconcile';

/**
 * The two bugs that made server persistence silently lossy.
 *
 * Neither threw, neither logged, and neither showed up in any existing test — the app signed in,
 * fetched a full profile, and displayed an empty one. Both were found by an independent review of
 * the schema against the code that used it, then reproduced here before being fixed.
 *
 * These tests deliberately assert on `reconcile.ts` rather than mocking Supabase. What broke was
 * never the network call; it was the shape of what came back through it.
 */

const PASSPORT: FieldCandidate = {
  field: 'fullName',
  value: 'Maria Gonzalez',
  documentId: 'doc-passport',
  documentType: 'passport',
  confidence: 0.94,
  readAt: 1_000,
};

const PAY_STUB: FieldCandidate = {
  field: 'fullName',
  value: 'Maria G Gonzalez',
  documentId: 'doc-paystub',
  documentType: 'pay_stub',
  confidence: 0.81,
  readAt: 2_000,
};

describe('a profile reloaded from the server', () => {
  /*
   * Bug 1. `loadProfile` rebuilt every candidate with `documentType: 'unknown'`, described in a
   * comment as a harmless default. `authorityRank` returns Infinity for 'unknown' and
   * `resolveField` filters those out, so a full set of stored fields reconciled to nothing.
   */
  it('cannot use a candidate whose document type was lost', () => {
    expect(authorityRank('fullName', 'unknown')).toBe(Infinity);

    const lost: FieldCandidate[] = [{ ...PASSPORT, documentType: 'unknown' }];
    expect(resolveField('fullName', lost)).toBeNull();
  });

  it('resolves normally once the document type round-trips', () => {
    const kept: FieldCandidate[] = [{ ...PASSPORT }];
    expect(resolveField('fullName', kept)?.value).toBe('Maria Gonzalez');
  });

  /*
   * Bug 2. `saveDocument` upserted one row per (user, field) onto a unique constraint, so the
   * second document to mention a field overwrote the first. Only one candidate per field could
   * exist server-side.
   *
   * The harm is not abstract. Authority, not recency, decides a name: a passport outranks a pay
   * stub. Under last-write-wins the pay stub's payroll spelling replaces the passport's legal one
   * purely because it was scanned second — and that is the name printed onto a government form
   * the applicant then signs.
   */
  it('prefers the passport over a pay stub read later, when both are kept', () => {
    expect(PAY_STUB.readAt).toBeGreaterThan(PASSPORT.readAt);

    const resolved = resolveField('fullName', [PASSPORT, PAY_STUB]);
    expect(resolved?.value).toBe('Maria Gonzalez');
    expect(resolved?.documentType).toBe('passport');
  });

  it('would have printed the payroll spelling if only the last write survived', () => {
    // Exactly what the old unique-on-(user, field) upsert could physically represent.
    const asOverwritten = [PAY_STUB];
    expect(resolveField('fullName', asOverwritten)?.value).toBe('Maria G Gonzalez');
  });

  /*
   * A disagreement only escalates to the user between documents of equal authority — two state
   * IDs, not an ID and a pay stub. Storing one candidate per field made that unrepresentable, so
   * the question was never asked.
   */
  it('raises a conflict when two equally authoritative documents disagree', () => {
    const first: FieldCandidate = {
      field: 'fullName', value: 'Maria Gonzalez', documentId: 'id-a',
      documentType: 'state_id', confidence: 0.9, readAt: 1_000,
    };
    const second: FieldCandidate = {
      field: 'fullName', value: 'Maria Gonzales', documentId: 'id-b',
      documentType: 'state_id', confidence: 0.9, readAt: 2_000,
    };

    const resolved = resolveField('fullName', [first, second]);
    expect(resolved?.conflicts.length).toBe(1);
  });

  it('reconciles a whole profile without dropping fields', () => {
    const stored: FieldCandidate[] = [
      PASSPORT,
      { field: 'dob', value: '03/14/1958', documentId: 'doc-passport', documentType: 'passport', confidence: 0.9, readAt: 1_000 },
      { field: 'address', value: '1240 Grand Concourse, Bronx, NY 10456', documentId: 'doc-bill', documentType: 'utility_bill', confidence: 0.88, readAt: 3_000 },
      { field: 'income', value: '41200', documentId: 'doc-w2', documentType: 'w2', confidence: 0.85, readAt: 4_000 },
    ];

    expect(reconcile(stored).map((r) => r.field).sort()).toEqual([
      'address', 'dob', 'fullName', 'income',
    ]);
  });
});
