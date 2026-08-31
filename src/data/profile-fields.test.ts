import { boroughFromZip, fieldDef, profileFields } from './profile-fields';

describe('the Master Profile schema', () => {
  it('names a document source for every extractable field', () => {
    // "Extractable but from nowhere" is incoherent — the pipeline would have nothing to read.
    for (const field of profileFields) {
      if (field.extractable) expect(field.source).not.toBeNull();
    }
  });

  it('keeps household size non-extractable', () => {
    // Leases list occupants too inconsistently to trust OCR; the UI must ask instead.
    expect(fieldDef('household').extractable).toBe(false);
  });

  it('records extraction logic for every field', () => {
    for (const field of profileFields) {
      expect(field.note.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate keys', () => {
    const keys = profileFields.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('throws on an unknown field rather than returning undefined', () => {
    // @ts-expect-error deliberately invalid
    expect(() => fieldDef('nope')).toThrow(/Unknown profile field/);
  });
});

describe('boroughFromZip', () => {
  it.each([
    ['10012', 'Manhattan'],
    ['10456', 'Bronx'],
    ['11215', 'Brooklyn'],
    ['11101', 'Queens'],
    ['11375', 'Queens'],
    ['10301', 'Staten Island'],
  ])('derives %s as %s', (zip, borough) => {
    expect(boroughFromZip(zip)).toBe(borough);
  });

  it('returns null outside NYC rather than guessing', () => {
    // A wrong borough misroutes an application, so silence beats a guess.
    expect(boroughFromZip('90210')).toBeNull();
    expect(boroughFromZip('12345')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(boroughFromZip('')).toBeNull();
    expect(boroughFromZip('abcde')).toBeNull();
  });

  it('covers the Bronx range used by the sample profile', () => {
    expect(boroughFromZip('10451')).toBe('Bronx');
    expect(boroughFromZip('10475')).toBe('Bronx');
  });
});
