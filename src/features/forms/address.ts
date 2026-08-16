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

  let rest = titleTrim(address);
  const parts: AddressParts = {};

  const zip = rest.match(/\b(\d{5})(?:-\d{4})?\s*$/);
  if (zip) {
    parts.zip = zip[1];
    rest = titleTrim(rest.slice(0, zip.index));
  }

  const state = rest.match(/[,\s]+([A-Za-z]{2}|New York|New Jersey|Connecticut)\s*$/i);
  if (state) {
    const raw = state[1].toLowerCase();
    parts.state = STATE_NAMES[raw] ?? state[1].toUpperCase();
    rest = titleTrim(rest.slice(0, state.index));
  }

  // Whatever is left is "street[, city]". The last comma separates them; with no comma we only
  // know the street, and inventing a city from a street name would be worse than leaving it out.
  const segments = rest.split(',').map(titleTrim).filter(Boolean);
  if (segments.length >= 2) {
    parts.city = segments[segments.length - 1];
    const streetLine = segments.slice(0, -1).join(', ');
    const split = splitApt(streetLine);
    parts.street = split.street;
    if (split.apt) parts.apt = split.apt;
  } else if (segments.length === 1) {
    const split = splitApt(segments[0]);
    parts.street = split.street;
    if (split.apt) parts.apt = split.apt;
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
