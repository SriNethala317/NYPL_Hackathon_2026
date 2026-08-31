/**
 * Destroying identifiers we refuse to hold, before they can reach a response.
 *
 * A copy of the app's `src/features/extraction/redact.ts`, kept in step with it. It lives here
 * because redaction has to happen on the server side of this boundary: once a value is in a JSON
 * payload travelling back to a phone it has already existed somewhere we did not intend, and
 * "we delete it on arrival" is a weaker promise than "it never arrived".
 *
 * Rules are tagged with the `neverStore` key they enforce so this table and
 * `src/data/document-types.ts` cannot silently drift apart.
 */

export const REDACTED = '[removed]';

type Rule = {
  /** The `neverStore` key this rule exists to enforce. */
  key: string;
  pattern: RegExp;
};

const RULES: Rule[] = [
  /*
   * A Social Security number, unlabelled.
   *
   * Deliberately not label-anchored: a W-2's box-a label frequently does not survive a photograph,
   * and "123-45-6789" is unambiguous enough on its own. The labelled solid-nine-digit form is a
   * separate rule because nine bare digits with no label is far too common to redact blindly — it
   * would take EINs, account numbers and phone numbers with it.
   */
  { key: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  { key: 'ssn', pattern: /\b(?:ssn|social\s*security(?:\s*(?:no|number|#))?)\b[^\dA-Za-z]{0,12}(\d{9})\b/gi },

  { key: 'sevisId', pattern: /\bN\d{10}\b/g },
  { key: 'sevisId', pattern: /\bsevis\s*(?:id|no|number|#)?\b[^\dA-Za-z]{0,12}(N?\d{9,11})\b/gi },

  { key: 'alienNumber', pattern: /\bA[-#\s]?\d{8,9}\b/g },
  { key: 'alienNumber', pattern: /\b(?:uscis|alien\s*(?:registration)?)\s*(?:no|number|#)?\b[^\dA-Za-z]{0,12}(\d{8,9})\b/gi },

  /*
   * Bank account numbers, label-anchored only.
   *
   * A bank statement is also the best evidence of both address and income, and a blanket
   * digit-run rule would take the balance and the routing line with it. Anchoring on the label
   * costs recall on an unlabelled statement and is still the right trade.
   */
  { key: 'accountNumber', pattern: /\b(?:account|acct)\s*(?:no|number|#)?\b[^\dA-Za-z]{0,12}(\d{6,17})\b/gi },
  { key: 'accountNumber', pattern: /\b\d{15,19}\b/g },

  /*
   * Employer identification number.
   *
   * Not in the app's copy of these rules, and here on purpose: the W-2 prompt asks for `employer_ein`
   * so the model does not return a confusing null, and this is the boundary that stops it coming
   * back. An EIN carries no check digit, so a misread cannot be detected — one more reason not to
   * carry it around.
   */
  { key: 'employerEin', pattern: /\b\d{2}-\d{7}\b/g },
];

/** Removes every rule's matches, reporting which kinds were found. */
export function redact(text: string): { text: string; removed: string[] } {
  let out = text;
  const removed = new Set<string>();

  for (const rule of RULES) {
    out = out.replace(rule.pattern, (match, captured) => {
      removed.add(rule.key);
      // A label-anchored rule captures only the digits, so the label itself is preserved: the
      // reader can still see that an SSN was present and destroyed, which is a stronger statement
      // than a silent gap.
      return typeof captured === 'string' ? match.replace(captured, REDACTED) : REDACTED;
    });
  }

  return { text: out, removed: [...removed] };
}

/** Whether anything we refuse to hold is still present. Used to assert the boundary held. */
export function containsSensitive(text: string): boolean {
  return RULES.some((rule) => new RegExp(rule.pattern.source, rule.pattern.flags).test(text));
}
