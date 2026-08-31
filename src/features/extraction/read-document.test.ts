import { classify } from './read-document';

/**
 * Classification decides which fields get read off a document, so a wrong answer here propagates
 * into everything downstream. The threshold matters as much as the match: naming a document on
 * thin evidence is worse than asking.
 */
describe('classify', () => {
  it.each([
    ['w2', 'Form W-2 Wage and Tax Statement\nEmployee name\nMARIA REYES'],
    ['pay_stub', 'ATLAS HOME CARE INC\nEarnings statement\nGross pay\nPay period'],
    ['utility_bill', 'Con Edison\nService address\nAmount due'],
    ['passport', 'UNITED STATES OF AMERICA\nPASSPORT\nSurname'],
    ['i20', 'Certificate of Eligibility for Nonimmigrant Student Status\nSEVIS ID'],
  ])('recognises a %s', (expected, text) => {
    expect(classify(text).type).toBe(expected);
  });

  it('returns unknown for text with no signature', () => {
    const result = classify('Dear resident,\nThank you for your enquiry.\nSincerely,');
    expect(result.type).toBe('unknown');
    expect(result.confidence).toBe(0);
  });

  it('is not confident on a single weak keyword', () => {
    // One word on a page is thin evidence. Below the floor the user is asked instead.
    const result = classify('amount due');
    expect(result.confidence).toBeLessThan(0.6);
  });

  it('is more confident when several signatures agree', () => {
    const weak = classify('gross pay');
    const strong = classify('Earnings statement\ngross pay\npay period');
    expect(strong.confidence).toBeGreaterThan(weak.confidence);
  });

  it('prefers the more specific type when two could match', () => {
    // A W-2 mentions wages and so does a pay stub; only a W-2 says "W-2".
    expect(classify('Form W-2 Wage and Tax Statement\ngross pay').type).toBe('w2');
  });

  it('survives empty and enormous input', () => {
    expect(classify('').type).toBe('unknown');
    expect(() => classify('noise\n'.repeat(20_000))).not.toThrow();
  });
});
