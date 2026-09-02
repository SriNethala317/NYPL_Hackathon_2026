/**
 * Removing the identifiers this app refuses to hold, at the moment text enters it.
 *
 * `field-matchers` never *targets* SSN, SEVIS ID or an alien number — there is no label for any of
 * them — so they were never going to become profile fields. But a W-2 has an SSN printed on it,
 * and once a page is transcribed that number is sitting in a plain string that the reading screen
 * displays, a crash reporter might attach, and a future contributor might helpfully persist.
 *
 * "We never captured it" is a promise about the extractor. This is the promise about everything
 * downstream of the extractor: the identifier is destroyed at the boundary, so there is no window
 * in which it exists in a form anything else can pick up.
 *
 * Deliberately conservative. Over-redaction costs a field the user retypes; under-redaction puts
 * somebody's Social Security number in a log, and for this audience that is the difference between
 * a useful app and a dangerous one. Where a pattern is ambiguous it is matched only next to its
 * label, so an income figure is never mistaken for an account number.
 */

/** What replaces a redacted value. Visible on purpose, so a user can see it was dropped, not missed. */
export const REDACTED = '[removed]';

type Rule = {
  /** The `neverStore` key this enforces, so the registry and this file cannot drift apart. */
  key: string;
  pattern: RegExp;
  /** Rebuilds the match with the sensitive part replaced, keeping any label for context. */
  replace: (match: string, ...groups: string[]) => string;
};

const RULES: Rule[] = [
  {
    // 123-45-6789. Distinctive enough to match unlabelled, which matters — a W-2 prints the SSN
    // in a box whose label may not survive OCR.
    key: 'ssn',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replace: () => REDACTED,
  },
  {
    // The same number written solid, but only where a label vouches for it. Nine bare digits are
    // otherwise indistinguishable from a routing number or a case reference.
    key: 'ssn',
    pattern: /\b(soc(?:ial)?\.?\s*sec(?:urity)?\.?(?:\s*(?:no|num(?:ber)?|#))?|ssn|ssa)\b\s*[:#]?\s*(\d{3}-?\d{2}-?\d{4})\b/gi,
    replace: (_match, label) => `${label}: ${REDACTED}`,
  },
  {
    // SEVIS identifiers on an I-20: N followed by ten digits.
    key: 'sevisId',
    pattern: /\bN\d{10}\b/g,
    replace: () => REDACTED,
  },
  {
    key: 'sevisId',
    pattern: /\b(sevis\s*(?:id|no|num(?:ber)?|#)?)\b\s*[:#]?\s*([A-Z]?\d{7,11})\b/gi,
    replace: (_match, label) => `${label}: ${REDACTED}`,
  },
  {
    // Alien registration number: A followed by 8 or 9 digits, often written A#.
    key: 'alienNumber',
    pattern: /\bA[-#\s]?\d{8,9}\b/g,
    replace: () => REDACTED,
  },
  {
    key: 'alienNumber',
    pattern: /\b(alien\s*(?:registration\s*)?(?:no|num(?:ber)?|#)?|USCIS\s*#?)\b\s*[:#]?\s*(A?[-\s]?\d{8,9})\b/gi,
    replace: (_match, label) => `${label}: ${REDACTED}`,
  },
  {
    /*
     * Account numbers, label-anchored only.
     *
     * A bank statement is also the best evidence of address and income, so it has to stay
     * readable. Blanket-redacting long digit runs would take the balance with it. Matching only
     * after "account no" keeps the useful parts of the page intact.
     */
    key: 'accountNumber',
    pattern: /\b(acc?(?:oun)?t\.?\s*(?:no|num(?:ber)?|#)?)\b\s*[:#]?\s*([\dX*•-]{6,20})\b/gi,
    replace: (_match, label) => `${label}: ${REDACTED}`,
  },
  {
    // Card-length runs, grouped or solid, wherever they appear. No benefits form needs one.
    key: 'accountNumber',
    pattern: /\b(?:\d[ -]?){15,19}\b/g,
    replace: () => REDACTED,
  },
];

/**
 * Strips every never-store identifier from a block of transcribed text.
 *
 * Returns what it removed as well as the cleaned text, so the reading screen can tell the user
 * "we saw your Social Security number and threw it away" — which is a stronger and more
 * trustworthy claim than silently handing back a page with a gap in it.
 */
export function redact(text: string): { text: string; removed: string[] } {
  const removed = new Set<string>();
  let out = text;

  for (const rule of RULES) {
    out = out.replace(rule.pattern, (...args) => {
      removed.add(rule.key);
      // `replace` receives (match, ...groups, offset, string); the trailing two are not wanted.
      const groups = args.slice(1, -2) as string[];
      return rule.replace(args[0] as string, ...groups);
    });
  }

  return { text: out, removed: [...removed].sort() };
}

/** Whether any never-store identifier appears in this text. Used by tests as a tripwire. */
export function containsSensitive(text: string): boolean {
  return redact(text).removed.length > 0;
}
