/**
 * Splitting a full name into the boxes a form asks for.
 *
 * The profile holds one name, because that is how a document prints it and how a person says it.
 * Forms disagree: the two Rent Freeze forms want a single `name` box, while the IDNYC application
 * wants `First Name`, `Middle Initial` and `Last Name` separately. Something has to split it.
 *
 * That split is genuinely lossy, and the failure mode is somebody's legal name being wrong on a
 * government form they then sign. So this is deliberately conservative:
 *
 *   - Two words is the only unambiguous case. "Maria Gonzalez" → first Maria, last Gonzalez.
 *   - A comma means the family name came first, which is how identity documents print it:
 *     "GONZALEZ, MARIA" → first Maria, last Gonzalez.
 *   - Spanish and Portuguese naming commonly uses TWO family names — "María García Piñedo" —
 *     where the naive reading gives the middle name García and loses Piñedo entirely. There is no
 *     way to tell that apart from an English middle name by looking at it, so a three-part name
 *     with no comma returns nothing rather than guessing.
 *   - Particles that belong to the surname ("de", "van", "del", "bin") are kept with it.
 *
 * Returning nothing is a real answer. The caller degrades to a blank box with "add this yourself",
 * which costs the applicant ten seconds. Guessing costs them a rejected application.
 */

export type NameParts = {
  first?: string;
  middleInitial?: string;
  last?: string;
};

/**
 * Lowercase particles that attach to the family name rather than standing alone.
 *
 * "Maria de la Cruz" is first Maria, last "de la Cruz" — not middle "de", last "Cruz".
 */
const SURNAME_PARTICLES = new Set([
  'de',
  'del',
  'de la',
  'della',
  'di',
  'da',
  'das',
  'dos',
  'du',
  'la',
  'le',
  'van',
  'von',
  'der',
  'ter',
  'ten',
  'bin',
  'ibn',
  'al',
  'mac',
  'mc',
  "o'",
  'san',
  'santa',
  'st',
]);

function tidy(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function parseName(full: string | undefined): NameParts {
  const name = tidy(full ?? '');
  if (!name) return {};

  /*
   * "GONZALEZ, MARIA" — the comma is the one reliable signal a document gives us, because it is
   * how identity cards and government records print a name. Trust it over word order.
   */
  if (name.includes(',')) {
    const [family, given] = name.split(',').map(tidy);
    if (!family || !given) return {};

    const givenParts = given.split(' ');
    return {
      first: givenParts[0],
      middleInitial: initialOf(givenParts.slice(1)),
      last: family,
    };
  }

  const parts = name.split(' ');

  if (parts.length === 1) {
    // A single word is a surname on most forms, but we cannot know that. Leave it whole and let
    // the applicant place it.
    return {};
  }

  if (parts.length === 2) {
    return { first: parts[0], last: parts[1] };
  }

  /*
   * Three or more words with no comma.
   *
   * Pull any surname particle back into the family name — "Maria de la Cruz" is a first name and
   * a three-word surname. What is left over in the middle is the ambiguous case: an English
   * middle name and a Spanish second surname look identical, and choosing wrong silently drops
   * half of somebody's family name.
   */
  const firstParticle = parts.findIndex((part, index) => index > 0 && isParticle(part));
  if (firstParticle > 0) {
    return {
      first: parts.slice(0, firstParticle).join(' '),
      last: parts.slice(firstParticle).join(' '),
    };
  }

  return {};
}

function isParticle(word: string): boolean {
  return SURNAME_PARTICLES.has(word.toLowerCase().replace(/\.$/, ''));
}

/** A middle name reduced to the single letter the form has room for. */
function initialOf(words: string[]): string | undefined {
  const middle = words.filter(Boolean)[0];
  if (!middle) return undefined;
  return middle.charAt(0).toUpperCase();
}

/**
 * Whether a name could be split at all, so a caller can explain the gap rather than show a blank.
 */
export function canSplitName(full: string | undefined): boolean {
  const parts = parseName(full);
  return Boolean(parts.first && parts.last);
}
