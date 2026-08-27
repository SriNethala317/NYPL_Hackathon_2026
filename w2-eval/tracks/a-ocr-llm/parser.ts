import { normalizeAmount, normalizeYear } from '../../core/normalize.ts';
import type { OcrLine, OcrPage } from './ocr/types.ts';

/**
 * Reading a W-2 from positioned lines, deterministically.
 *
 * This is the artifact that matters most in Track A. It has **zero imports outside `core/` and its
 * own OCR types** — no provider, no model, no Node built-ins — so it can be lifted into the app or
 * an edge function unchanged.
 *
 * ## What it will not do
 *
 * Guess. Every value here is either found at a known position relative to a label it matched, or
 * it is `null`. There is no fallback that returns "the first number on the page", because that is
 * precisely how a stray figure becomes somebody's assessed income.
 *
 * That constraint is the whole reason to prefer this over a model for the fields that matter. A
 * vision model asked for Box 5 on a page with no Box 5 will very often produce a plausible number:
 * measured here, `qwen3-vl` wrote `0.00` into 59 boxes that were not on the page and invented 53
 * box-12 rows. A parser that cannot find its anchor returns nothing, every time, for free.
 */

/** How close two lines' vertical centres must be to count as the same row, as a share of height. */
const SAME_ROW = 0.6;

/** How far below a label its value may sit, in multiples of the label's own height. */
const BELOW_REACH = 2.2;

export type Anchor = {
  /** Where the parsed value lands in the output. */
  field: string;
  /**
   * Label spellings to look for, normalised. Order matters: the first match wins, so the most
   * specific spelling goes first — "medicare wages and tips" before "wages", or a W-2 whose Box 1
   * label contains the word "wages" will answer for Box 5 as well.
   */
  labels: string[];
  /**
   * Where the value sits relative to the label.
   *
   * `standalone` has no label at all: it looks for a line matching `shape` inside `region`. Used
   * only where a form prints a value with nothing beside it to anchor on — the tax year sits alone
   * in the top corner of every layout in the corpus, and an anchor that needs a label cannot ever
   * find it.
   */
  position: 'below' | 'right' | 'same-line-after' | 'standalone';

  /** For `standalone`: the fraction of the page to search, as {top, bottom} in 0-1. */
  region?: { top: number; bottom: number };

  /**
   * For `standalone`: a line may only supply the value if it *also* matches this.
   *
   * The guard against a shape matching something that merely looks like the value. Loosening the
   * year pattern to find a year buried in a title line immediately started reading `1900` out of
   * the 4-up sheet's employer address, `1900 PORT RD, ELIZABETH, NJ 07201`. Requiring the line to
   * look like a W-2 title as well costs nothing and makes that impossible.
   */
  corroborate?: RegExp;

  /**
   * How far below the label to look, in multiples of the label's height. Defaults to `BELOW_REACH`.
   *
   * Raised only where a form prints a value with no label of its own. On the payroll layouts the
   * employee address is simply the third line of the `e Employee` block — name, then street, then
   * nothing to anchor on. Reaching further is safe there *because the shape is strict*: a street
   * number followed by a state and a five-digit ZIP is not something another field accidentally
   * looks like. Widen the reach only when the shape can carry the weight.
   */
  reach?: number;
  /** What a plausible value looks like. A match that fails this is discarded, not coerced. */
  shape: RegExp;
};

const MONEY = /^\$?\s*[\d,]+(\.\d{1,2})?$/;
const YEAR = /\b(19|20)\d{2}\b/;
const NAME = /^[\p{L}][\p{L}\s.'’\-,]{2,}$/u;
const ADDRESS = /\d.*[A-Za-z]{2}\s*\d{5}/;

/**
 * The four fields the screener consumes, and nothing else.
 *
 * Anchors for the other thirty-odd boxes are not here because nothing downstream reads them, and
 * every anchor is a thing that can match the wrong line. Fewer anchors is fewer ways to be wrong.
 *
 * Label spellings were taken from the corpus layouts: the IRS red-ink form, a condensed 4-up laser
 * print, and two payroll-provider styles. Where a spelling exists only to satisfy one of them, the
 * comment says which — that history is the most useful thing for whoever extends this.
 */
export const ANCHORS: Anchor[] = [
  {
    field: 'box5_medicare_wages',
    labels: [
      '5 medicare wages and tips',
      'medicare wages and tips',
      'medicare wages',
    ],
    position: 'below',
    shape: MONEY,
  },
  {
    field: 'box1_wages',
    labels: [
      '1 wages tips other compensation',
      'wages tips other compensation',
      // The 4-up sheet abbreviates; the payroll layouts spell it out in sentence case.
      'wages tips other comp',
    ],
    position: 'below',
    shape: MONEY,
  },
  {
    field: 'employee_name',
    labels: [
      // IRS red-ink prints box e as a long instruction; the payroll layouts just say "e Employee".
      'e employees first name and initial last name',
      'employees first name and initial last name',
      'e employee',
      'employee name',
    ],
    position: 'below',
    shape: NAME,
  },
  {
    field: 'employee_address',
    labels: [
      'f employees address and zip code',
      'employees address and zip code',
      'f address',
      'employee address',
      // The payroll layouts label the block once and let the address be its third line.
      'e employee',
    ],
    position: 'below',
    reach: 5,
    shape: ADDRESS,
  },
  {
    field: 'tax_year',
    // No label: every layout in the corpus prints the year alone in the top corner. The IRS form
    // puts "2025" at (815, 21) with the title on a separate line entirely, so an anchored rule
    // could not reach it.
    labels: [],
    position: 'standalone',
    region: { top: 0, bottom: 0.2 },
    shape: /\b20\d{2}\b/,
    // "Form W-2 2025", "ADP · Form W-2 Wage and Tax Statement · 2025", "Tax year 2025".
    corroborate: /\b(w\s*-?\s*2|tax\s+(year|statement))\b/i,
  },
];

/**
 * Lowercase, strip punctuation, collapse whitespace. OCR spacing is not load-bearing.
 *
 * Apostrophes are **deleted** rather than turned into spaces, and the distinction is not cosmetic.
 * Replacing them split every possessive on the form: `EMPLOYEE'S ADDRESS` became `employee s
 * address`, so the label `employees address and zip code` never matched and the address came back
 * null on three of the four layouts. Every W-2 box label is a possessive, so this one character
 * decided most of the corpus.
 *
 * Curly apostrophes are included because OCR emits both, and which one you get is a property of
 * the font rather than of the document.
 */
export function normalizeLabel(text: string): string {
  return text
    .toLowerCase()
    .replace(/['\u2018\u2019\u02bc]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Vertical centre, used for row grouping. */
const centreY = (line: OcrLine) => line.y + line.h / 2;

/**
 * Whether a line's normalised text begins with one of the label spellings.
 *
 * Prefix rather than substring, because a value line frequently *contains* a label's words. On the
 * payroll layouts the row reads "5 Medicare wages and tips        43800.00" as one region, and a
 * substring test on the value line would match the label and then look below it for the value —
 * finding the next row's figure.
 */
function labelIndex(line: OcrLine, labels: readonly string[]): number {
  const text = normalizeLabel(line.text);
  for (const [index, label] of labels.entries()) {
    if (text.startsWith(label)) return index;
  }
  return -1;
}

/** The first plausible value on the same line, after the label text itself. */
function valueAfterLabel(line: OcrLine, label: string, shape: RegExp): string | null {
  const text = normalizeLabel(line.text);
  const rest = text.slice(label.length).trim();
  if (rest === '') return null;

  const match = rest.match(shape) ?? line.text.match(shape);
  return match ? match[0].trim() : null;
}

/**
 * The value sitting below a label, or on the same line to its right.
 *
 * Both are tried in every case, because layout varies: the IRS form puts the figure under its
 * label, the payroll layouts put it on the same row at the far right. Trying both and taking
 * whichever produces a plausibly-shaped value is simpler and more robust than classifying the
 * layout first — and a wrongly classified layout would fail silently on every field at once.
 */
function findValue(page: OcrPage, label: OcrLine, anchor: Anchor): OcrLine | null {
  const tolerance = label.h * SAME_ROW;

  // Same row, to the right of the label.
  const sameRow = page.lines
    .filter(
      (l) =>
        l !== label &&
        Math.abs(centreY(l) - centreY(label)) < tolerance &&
        l.x >= label.x &&
        anchor.shape.test(l.text.trim()),
    )
    .sort((a, b) => a.x - b.x);
  if (sameRow[0]) return sameRow[0];

  // Below the label, horizontally overlapping it.
  const below = page.lines
    .filter((l) => {
      if (l === label) return false;
      const gap = centreY(l) - centreY(label);
      if (gap <= 0 || gap > label.h * (anchor.reach ?? BELOW_REACH)) return false;
      // Must share horizontal extent, or the "value" is a different column entirely.
      const overlaps = l.x < label.x + label.w && l.x + l.w > label.x;
      return overlaps && anchor.shape.test(l.text.trim());
    })
    .sort((a, b) => centreY(a) - centreY(b));

  return below[0] ?? null;
}

export type ParsedField = {
  field: string;
  value: string;
  /** 0-1: OCR confidence for the value, tempered by how cleanly the label matched. */
  confidence: number;
  /** The line the value came from, so a caller can check emptiness or show provenance. */
  source: OcrLine;
};

export type ParseResult = {
  fields: ParsedField[];
  /** Anchors whose label was never found. Distinct from a label found with no value beside it. */
  unmatched: string[];
  /** Anchors whose label was found but which had no plausible value near it. */
  unreadable: string[];
};

/**
 * Runs every anchor over a page.
 *
 * Confidence combines two things the parser actually knows: how sure the recogniser was about the
 * characters, and how exactly the label matched. A value read at 0.99 under a label that only
 * matched the third, loosest spelling is less trustworthy than the same value under an exact
 * match, and the difference is worth carrying — it is the input to the cross-check downstream.
 */
export function parse(page: OcrPage): ParseResult {
  const fields: ParsedField[] = [];
  const unmatched: string[] = [];
  const unreadable: string[] = [];

  for (const anchor of ANCHORS) {
    if (anchor.position === 'standalone') {
      const { top = 0, bottom = 1 } = anchor.region ?? {};
      const inRegion = page.lines.filter((l) => {
        const centre = centreY(l) / page.height;
        return centre >= top && centre <= bottom && anchor.shape.test(l.text.trim());
      });

      /*
       * A line that is *only* the value beats one that merely contains it.
       *
       * The IRS form prints "2025" alone in the corner; the payroll layouts bury it in
       * "ADP · Form W-2 Wage and Tax Statement · 2025". Both are the right answer, but the bare
       * one is better evidence, so it wins when both are present.
       */
      const bare = inRegion.filter((l) => /^20\d{2}$/.test(l.text.trim()));

      // A line that only *contains* the value must corroborate: see `corroborate` above.
      const embedded = anchor.corroborate
        ? inRegion.filter((l) => anchor.corroborate!.test(l.text))
        : inRegion;

      const candidates = (bare.length > 0 ? bare : embedded).sort(
        (a, b) => b.confidence - a.confidence,
      );

      const found = candidates[0];
      if (found === undefined) {
        unmatched.push(anchor.field);
        continue;
      }
      fields.push({
        field: anchor.field,
        value: normalizeYear(found.text) ?? found.text.trim(),
        // A value with no label to corroborate it is worth less than one that was anchored. The
        // discount is not arithmetic, it is a statement that this reading has less evidence.
        confidence: found.confidence * 0.85,
        source: found,
      });
      continue;
    }

    let best: { line: OcrLine; rank: number } | null = null;

    for (const line of page.lines) {
      const rank = labelIndex(line, anchor.labels);
      if (rank === -1) continue;
      if (best === null || rank < best.rank) best = { line, rank };
    }

    if (best === null) {
      unmatched.push(anchor.field);
      continue;
    }

    const raw =
      anchor.position === 'same-line-after'
        ? valueAfterLabel(best.line, anchor.labels[best.rank]!, anchor.shape)
        : (findValue(page, best.line, anchor)?.text.trim() ?? null);

    if (raw === null) {
      // The label is on the page and the value is not. That is "unreadable", not "absent", and
      // the difference is the one the check-image standards reserve a character for.
      unreadable.push(anchor.field);
      continue;
    }

    const source =
      anchor.position === 'same-line-after' ? best.line : (findValue(page, best.line, anchor) ?? best.line);

    // An exact match on the first spelling is worth full marks; each looser spelling costs a little.
    const labelQuality = 1 - best.rank * 0.08;
    const value = anchor.shape === MONEY ? (normalizeAmount(raw) ?? raw) : raw;

    fields.push({
      field: anchor.field,
      value: anchor.shape === YEAR ? (normalizeYear(value) ?? value) : value,
      confidence: Math.min(1, source.confidence * labelQuality),
      source,
    });
  }

  return { fields, unmatched, unreadable };
}
