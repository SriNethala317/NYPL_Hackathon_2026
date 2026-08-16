import { extractFields, matchesExpected, normalizeMoney, normalizeName } from './field-matchers';

/**
 * Unit tests for the field matchers, separate from the OCR accuracy suite.
 *
 * These run in milliseconds and need no images, so they are where the edge cases live — the
 * accuracy suite exists to measure a real engine, not to enumerate malformed inputs.
 */

describe('extractFields', () => {
  const payStub = [
    'ATLAS HOME CARE INC',
    'Earnings statement',
    'EMPLOYEE',
    'MARIA REYES',
    'GROSS PAY NET PAY',
    '2310.00 1902.44',
  ].join('\n');

  it('reads a well-formed pay stub', () => {
    const fields = extractFields(payStub, 'pay_stub');
    expect(fields.find((f) => f.key === 'fullName')?.value).toBe('MARIA REYES');
    expect(fields.find((f) => f.key === 'income')?.value).toBe('2310.00');
  });

  it('takes the first amount when two boxes share a line', () => {
    // "GROSS PAY | NET PAY" puts both numbers on one OCR line. Taking the whole line parses to
    // nothing; taking the second would report take-home pay as gross income.
    expect(extractFields(payStub, 'pay_stub').find((f) => f.key === 'income')?.value).toBe('2310.00');
  });

  it('only returns fields the document type declares', () => {
    // A passport says nothing about income, so asking invites a false positive from any stray
    // number on the page.
    const keys = extractFields(payStub, 'passport').map((f) => f.key);
    expect(keys).not.toContain('income');
  });

  it('returns nothing rather than guessing on empty input', () => {
    expect(extractFields('', 'pay_stub')).toEqual([]);
    expect(extractFields('   \n\n  \t ', 'pay_stub')).toEqual([]);
  });

  it('survives text with no recognisable structure', () => {
    expect(() => extractFields('qqqq\nzzzz\n!!!!', 'w2')).not.toThrow();
  });

  it('bounds the work it will do on a garbled scan', () => {
    // Unbounded, this was measured at ~1ms per line -- thousands of lines meant seconds of
    // frozen UI. Labels sit near the top of a form, so truncation costs almost nothing.
    const huge = `EMPLOYEE\nMARIA REYES\n${'noise line\n'.repeat(5000)}`;
    const started = Date.now();
    const fields = extractFields(huge, 'pay_stub');
    const elapsed = Date.now() - started;

    expect(fields.find((f) => f.key === 'fullName')?.value).toBe('MARIA REYES');
    expect(elapsed).toBeLessThan(1000);
  });

  it('tolerates OCR damage in a label', () => {
    // Tesseract renders "CUSTOMER NAME" as "CUSTOMER NAVE" on small type.
    const bill = 'Con Edison\nCUSTOMER NAVE\nMARIA REYES\nSERVICE ADDRESS\n12 MAIN ST';
    expect(extractFields(bill, 'utility_bill').find((f) => f.key === 'fullName')?.value).toBe(
      'MARIA REYES',
    );
  });

  it('does not confuse EMPLOYEE with EMPLOYER', () => {
    // One character apart, and a tolerant matcher will accept either for the other unless it
    // asks which is *closest* rather than which is close enough.
    const w2 = 'EMPLOYEE NAME\nMARIA REYES\nEMPLOYER NAME\nATLAS HOME CARE INC';
    const fields = extractFields(w2, 'w2');
    expect(fields.find((f) => f.key === 'fullName')?.value).toBe('MARIA REYES');
    expect(fields.find((f) => f.key === 'employer')?.value).toBe('ATLAS HOME CARE INC');
  });
});

describe('normalizeMoney', () => {
  it('keeps magnitude intact', () => {
    // Reading "27720.00" as "277" would understate an income by two orders of magnitude on a
    // benefits application.
    expect(normalizeMoney('27720.00')).toBe('27720.00');
    expect(normalizeMoney('$27,720.00')).toBe('27720.00');
  });

  it('returns the input unchanged when it is not a number', () => {
    expect(normalizeMoney('abc')).toBe('abc');
  });
});

describe('normalizeName', () => {
  it('strips OCR punctuation noise', () => {
    expect(normalizeName('MARIA  REYES.')).toBe('MARIA REYES');
  });

  it('keeps hyphens and apostrophes, which are part of real names', () => {
    expect(normalizeName("maria reyes-o'brien")).toBe("MARIA REYES-O'BRIEN");
  });
});

describe('matchesExpected', () => {
  it('compares money numerically', () => {
    expect(matchesExpected('income', '2310', '2310.00')).toBe(true);
    expect(matchesExpected('income', '231.00', '2310.00')).toBe(false);
  });

  it('ignores punctuation and case elsewhere', () => {
    expect(matchesExpected('fullName', 'maria reyes', 'MARIA REYES')).toBe(true);
  });
});
