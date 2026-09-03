/**
 * Splitting a one-line address into the parts a government form asks for.
 *
 * The profile holds an address the way a document prints it — "1240 Grand Concourse, Bronx, NY
 * 10456" — while every PDF wants street, apartment, city, state and ZIP in separate boxes. This
 * is the seam between the two.
 *
 * Nothing here guesses. A component that cannot be identified is left `undefined` so the form
 * shows a visible gap the applicant can fill, rather than a confident wrong value they might sign
 * without reading.
 */

export type AddressParts = {
  street?: string;
  apt?: string;
  city?: string;
  state?: string;
  zip?: string;
};

/** Two-letter state, or the handful of full names that turn up in NYC documents. */
const STATE_NAMES: Record<string, string> = {
  'new york': 'NY',
  'new jersey': 'NJ',
  connecticut: 'CT',
};

/**
 * The five boroughs, plus how people actually write them.
 *
 * Needed because an address with no commas — "1240 Grand Concourse Bronx NY 10456" — was putting
 * the borough into the street box and marking it filled. Recognising the borough is what lets the
 * city be split out without guessing where the street name ends.
 */
const BOROUGHS = ['manhattan', 'bronx', 'brooklyn', 'queens', 'staten island', 'new york'];

/** "APT 4B", "#4B", "UNIT 4B", "FL 2" — the ways an apartment shows up inside a street line. */
const APT_PATTERN = /\b(?:apt\.?|apartment|unit|#|ste\.?|suite|fl\.?|floor|rm\.?|room)\s*([\w-]+)\s*$/i;

function titleTrim(value: string): string {
  return value.replace(/\s+/g, ' ').trim().replace(/[,;]+$/, '');
}

/**
 * Pulls an apartment off the end of a street line.
 *
 * Only the trailing position is considered. "4B Grand Concourse" is a building number, not an
 * apartment, and treating it as one would move half the address into the wrong box.
 */
function splitApt(street: string): { street: string; apt?: string } {
  const match = street.match(APT_PATTERN);
  if (!match) return { street: titleTrim(street) };
  return {
    street: titleTrim(street.slice(0, match.index)),
    apt: match[1],
  };
}

/**
 * Parses an address into form components.
 *
 * Works back from the end, because the tail is the reliable part: a ZIP is unambiguous, a state
 * sits just before it, and whatever remains is street and city. Parsing forwards would have to
 * guess where the street name stops.
 */
export function parseAddress(address: string | undefined): AddressParts {
  if (!address) return {};

  // Newlines are separators, not spaces: a pasted address arrives one field per line.
  let rest = titleTrim(address.replace(/[\r\n]+/g, ', '));
  const parts: AddressParts = {};

  /*
   * An apartment written after the ZIP — "…, NY 10456, Apt 4B" — is common when people paste.
   * Pulled out first, because leaving it there made the ZIP and state unparseable and dropped
   * "Apt 4B" into the city box.
   */
  const trailingApt = rest.match(/[,\s]+(?:apt\.?|apartment|unit|#|ste\.?|suite|fl\.?|floor)\s*([\w-]+)\s*$/i);
  if (trailingApt) {
    parts.apt = trailingApt[1];
    rest = titleTrim(rest.slice(0, trailingApt.index));
  }

  const zip = rest.match(/\b(\d{5})(?:-\d{4})?\s*$/);
  if (zip) {
    parts.zip = zip[1];
    rest = titleTrim(rest.slice(0, zip.index));
  }

  // "N.Y." is as common as "NY" on a typed address, and was landing in the city box verbatim.
  const state = rest.match(/[,\s]+(N\.Y\.|[A-Za-z]{2}|New York|New Jersey|Connecticut)\s*$/i);
  if (state) {
    const raw = state[1].toLowerCase().replace(/\./g, '');
    parts.state = STATE_NAMES[raw] ?? raw.toUpperCase();
    rest = titleTrim(rest.slice(0, state.index));
  }

  // Whatever is left is "street[, city]". The last comma separates them; with no comma we only
  // know the street, and inventing a city from a street name would be worse than leaving it out.
  const segments = rest.split(',').map(titleTrim).filter(Boolean);

  if (segments.length >= 2) {
    parts.city = segments[segments.length - 1];
    const split = splitApt(segments.slice(0, -1).join(', '));
    parts.street = split.street;
    if (split.apt && !parts.apt) parts.apt = split.apt;
    return parts;
  }

  if (segments.length === 1) {
    const split = splitApt(segments[0]);

    /*
     * No comma to separate street from city. Rather than glue the borough onto the street and
     * report it as filled, look for a borough name at the end and split there. If there is no
     * borough to find, the city stays undefined — a blank box the applicant completes beats a
     * street line with "Bronx" buried in it on a form they are about to sign.
     */
    const borough = BOROUGHS.map((name) => {
      const match = split.street.match(new RegExp(`\\s+(${name})\\s*$`, 'i'));
      return match ? { name: match[1], index: match.index as number } : null;
    }).find(Boolean);

    if (borough) {
      parts.city = titleTrim(borough.name);
      parts.street = titleTrim(split.street.slice(0, borough.index));
    } else {
      parts.street = split.street;
    }

    if (split.apt && !parts.apt) parts.apt = split.apt;
  }

  return parts;
}

/** NYC boroughs are cities for postal purposes; forms accept them in the city box. */
export function isNycCity(city: string | undefined): boolean {
  if (!city) return false;
  return ['new york', 'manhattan', 'bronx', 'brooklyn', 'queens', 'staten island'].includes(
    city.trim().toLowerCase(),
  );
}
