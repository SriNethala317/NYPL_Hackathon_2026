import { parseAddress } from './address';

/**
 * The parser's own rule is that it never guesses — an unidentifiable component is left blank for
 * the applicant rather than filled with something plausible. These are the cases where it used to
 * break that rule and write confident nonsense into a government form.
 */
describe('parseAddress', () => {
  it('splits a fully punctuated address', () => {
    expect(parseAddress('1240 Grand Concourse, Apt 4B, Bronx, NY 10456')).toEqual({
      street: '1240 Grand Concourse',
      apt: '4B',
      city: 'Bronx',
      state: 'NY',
      zip: '10456',
    });
  });

  it('finds the borough when there are no commas at all', () => {
    // Previously produced street: "1240 Grand Concourse Bronx" -- the city glued onto the street
    // and reported as successfully filled.
    expect(parseAddress('1240 Grand Concourse Bronx NY 10456')).toMatchObject({
      street: '1240 Grand Concourse',
      city: 'Bronx',
      state: 'NY',
      zip: '10456',
    });
  });

  it('handles an apartment written after the ZIP', () => {
    // Previously put "Apt 4B" in the city box and left the ZIP and state unparsed.
    expect(parseAddress('1240 Grand Concourse, Bronx, NY 10456, Apt 4B')).toMatchObject({
      street: '1240 Grand Concourse',
      apt: '4B',
      city: 'Bronx',
      zip: '10456',
    });
  });

  it('understands "N.Y." as a state', () => {
    // Previously landed the literal text "N.Y." in the city box.
    expect(parseAddress('1240 Grand Concourse, Apt 4B, Bronx, N.Y. 10456')).toMatchObject({
      city: 'Bronx',
      state: 'NY',
      apt: '4B',
    });
  });

  it('handles a suite after the ZIP', () => {
    expect(parseAddress('350 5th Ave, New York, NY 10118, Suite 2100')).toMatchObject({
      street: '350 5th Ave',
      apt: '2100',
      city: 'New York',
    });
  });

  it('treats newlines as separators', () => {
    expect(parseAddress('1240 Grand Concourse\nBronx, NY 10456')).toMatchObject({
      street: '1240 Grand Concourse',
      city: 'Bronx',
      zip: '10456',
    });
  });

  it('does not mistake a street named after a borough for the city', () => {
    expect(parseAddress('55 Brooklyn Avenue, Brooklyn, NY 11213')).toMatchObject({
      street: '55 Brooklyn Avenue',
      city: 'Brooklyn',
    });
  });

  it('leaves the city blank rather than inventing one', () => {
    // No borough and no comma: we genuinely do not know where the street ends.
    const parts = parseAddress('1240 Grand Concourse');
    expect(parts.street).toBe('1240 Grand Concourse');
    expect(parts.city).toBeUndefined();
  });

  it('keeps ZIP+4 to five digits', () => {
    expect(parseAddress('1240 Grand Concourse, Bronx, NY 10456-1234').zip).toBe('10456');
  });

  it('returns nothing for empty input', () => {
    expect(parseAddress(undefined)).toEqual({});
    expect(parseAddress('   ')).toEqual({});
  });
});
