import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { OcrLine, OcrPage } from './ocr/types.ts';
import { normalizeLabel, parse } from './parser.ts';

/**
 * The parser is the durable artifact of this track, so it is tested against hand-built pages
 * rather than only end-to-end. These run in milliseconds and need no OCR engine, which is where
 * the edge cases belong; the corpus run exists to measure a real reader, not to enumerate
 * malformed input.
 *
 * Every case below is a layout that actually appears in `test-cases/`, or a failure that actually
 * happened while building this.
 */

let nextY = 0;
function line(text: string, x: number, y: number, w = 200, h = 18, confidence = 0.99): OcrLine {
  nextY = y;
  return { text, x, y, w, h, confidence };
}

function page(lines: OcrLine[], height = 800): OcrPage {
  return { lines, width: 1000, height, ink: 0.05, latencyMs: 0, engine: 'test' };
}

const valueOf = (result: ReturnType<typeof parse>, field: string) =>
  result.fields.find((f) => f.field === field)?.value ?? null;

test('reads the IRS layout, where the value sits below its label', () => {
  const result = parse(
    page([
      line('2025', 815, 21, 44, 22),
      line('22222 Form W-2 Wage and Tax Statement', 19, 30, 382, 27),
      line("E EMPLOYEE'S FIRST NAME AND INITIAL, LAST NAME", 27, 232, 247, 21),
      line('MARIA REYES', 28, 249, 108, 20),
      line("F EMPLOYEE'S ADDRESS AND ZIP CODE", 28, 275, 210, 17),
      line('1240 GRAND CONCOURSE, BRONX, NY 10456', 28, 291, 336, 20),
      line('5 MEDICARE WAGES AND TIPS', 30, 420, 190, 17),
      line('29000.00', 30, 437, 100, 22),
      line('1 WAGES, TIPS, OTHER COMPENSATION', 30, 320, 220, 17),
      line('27720.00', 30, 337, 100, 22),
    ]),
  );

  assert.equal(valueOf(result, 'box5_medicare_wages'), '29000.00');
  assert.equal(valueOf(result, 'box1_wages'), '27720.00');
  assert.equal(valueOf(result, 'employee_name'), 'MARIA REYES');
  assert.equal(valueOf(result, 'employee_address'), '1240 GRAND CONCOURSE, BRONX, NY 10456');
  assert.equal(valueOf(result, 'tax_year'), '2025');
});

test('a possessive label still matches after normalisation', () => {
  /*
   * The bug that cost three of four layouts their address. Apostrophes were being replaced with a
   * space, so "EMPLOYEE'S ADDRESS" normalised to "employee s address" and no label matched.
   * Every W-2 box label is a possessive, so this one character decided most of the corpus.
   */
  assert.equal(normalizeLabel("F EMPLOYEE'S ADDRESS AND ZIP CODE"), 'f employees address and zip code');
  assert.equal(normalizeLabel('F EMPLOYEE’S ADDRESS AND ZIP CODE'), 'f employees address and zip code');
});

test('reads a payroll layout, where the address has no label of its own', () => {
  // ADP prints the block once -- "e Employee", then the name, then the street -- so the address
  // must be found by shape below the block label rather than by a label beside it.
  const result = parse(
    page(
      [
        line('ADP · Form W-2 Wage and Tax Statement · 2025', 7, 5, 455, 23),
        line('e Employee', 566, 149, 72, 17),
        line('PRIYA RAMACHANDRAN', 568, 164, 150, 15),
        line('88 STEINWAY ST, ASTORIA, NY 11103', 568, 179, 192, 15),
      ],
      470,
    ),
  );

  assert.equal(valueOf(result, 'employee_name'), 'PRIYA RAMACHANDRAN');
  assert.equal(valueOf(result, 'employee_address'), '88 STEINWAY ST, ASTORIA, NY 11103');
  assert.equal(valueOf(result, 'tax_year'), '2025', 'the year is inside the title line here');
});

test('a year-shaped number in an address is not read as the tax year', () => {
  /*
   * Measured regression. Loosening the year pattern to reach a year buried in a title line
   * immediately started reading 1900 out of the 4-up sheet's employer address. The fix is
   * corroboration -- the line must also look like a W-2 title -- not a tighter number pattern,
   * because 2005 is a perfectly plausible year and 1900 PORT RD is a perfectly plausible address.
   */
  const result = parse(
    page([
      line('HARBORLIGHT LOGISTICS LLC, 1900 PORT RD, ELIZABETH, NJ 07201', 20, 40, 460, 15),
      line('5 Medicare wages and tips', 20, 180, 180, 12),
      line('64200.00', 20, 193, 90, 16),
    ]),
  );

  assert.equal(valueOf(result, 'tax_year'), null, 'no corroborating title line, so no year');
  assert.ok(result.unmatched.includes('tax_year'));
});

test('a label with nothing beside it is unreadable, not absent', () => {
  // The distinction the check-image standards reserve a character for. An engine that says
  // "the box is there and I could not read it" has told the truth; one that says null has told a
  // smaller truth; one that says 0.00 has lied.
  const result = parse(page([line('5 MEDICARE WAGES AND TIPS', 30, 420, 190, 17)]));

  assert.equal(valueOf(result, 'box5_medicare_wages'), null);
  assert.ok(result.unreadable.includes('box5_medicare_wages'), 'label found, value not');
  assert.ok(!result.unmatched.includes('box5_medicare_wages'), 'the label WAS found');
});

test('a page with nothing on it yields nothing, and says which anchors never matched', () => {
  const result = parse(page([]));

  assert.deepEqual(result.fields, []);
  assert.equal(result.unmatched.length, 5, 'every anchor reports its label was absent');
  assert.deepEqual(result.unreadable, []);
});

test('Box 1 does not answer for Box 5', () => {
  // Both labels contain "wages". Ordering the spellings most-specific-first is what keeps the
  // loose "medicare wages" from matching "1 Wages, tips, other compensation".
  const result = parse(
    page([
      line('1 Wages, tips, other compensation', 20, 100, 200, 14),
      line('27720.00', 460, 100, 80, 14),
      line('5 Medicare wages and tips', 20, 160, 200, 14),
      line('29000.00', 460, 160, 80, 14),
    ]),
  );

  assert.equal(valueOf(result, 'box1_wages'), '27720.00');
  assert.equal(valueOf(result, 'box5_medicare_wages'), '29000.00');
});

test('a value in a different column is not claimed as this label’s', () => {
  // Two boxes side by side. The figure under the right-hand label must not be read as belonging
  // to the left-hand one, which is what an overlap test prevents.
  const result = parse(
    page([
      line('5 MEDICARE WAGES AND TIPS', 30, 420, 190, 17),
      line('2 FEDERAL INCOME TAX WITHHELD', 520, 420, 200, 17),
      line('1980.00', 520, 437, 90, 22),
    ]),
  );

  assert.equal(valueOf(result, 'box5_medicare_wages'), null, 'no figure in box 5’s own column');
  assert.ok(result.unreadable.includes('box5_medicare_wages'));
});

test('money is normalised, and prose in a money box is refused', () => {
  const withCommas = parse(
    page([line('5 Medicare wages and tips', 20, 100, 200, 14), line('$29,000', 460, 100, 80, 14)]),
  );
  assert.equal(valueOf(withCommas, 'box5_medicare_wages'), '29000.00');

  const withProse = parse(
    page([line('5 Medicare wages and tips', 20, 100, 200, 14), line('see attached', 460, 100, 80, 14)]),
  );
  assert.equal(valueOf(withProse, 'box5_medicare_wages'), null, 'shape refuses it rather than coercing');
});

test('confidence carries how well the label matched, not just the OCR score', () => {
  // Same value read equally well, under an exact label and under the loosest spelling. The second
  // has less evidence behind it and must say so -- that number is the input to the cross-check.
  const exact = parse(
    page([
      line('5 medicare wages and tips', 20, 100, 200, 14, 0.99),
      line('29000.00', 460, 100, 80, 14, 0.99),
    ]),
  );
  const loose = parse(
    page([
      line('medicare wages', 20, 100, 200, 14, 0.99),
      line('29000.00', 460, 100, 80, 14, 0.99),
    ]),
  );

  const exactConf = exact.fields.find((f) => f.field === 'box5_medicare_wages')!.confidence;
  const looseConf = loose.fields.find((f) => f.field === 'box5_medicare_wages')!.confidence;
  assert.ok(looseConf < exactConf, `${looseConf} should be below ${exactConf}`);
});
