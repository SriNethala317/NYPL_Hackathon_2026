import { documentTypes } from './document-types';
import {
  documentDestination,
  documentsWeRead,
  fieldsWeKeep,
  labelForNeverStored,
  neverStored,
} from './privacy-facts';

import { createGeminiProvider } from '@/features/extraction/gemini-vision';
import { ocrProvider } from '@/features/extraction/ocr-provider';
import { profileFields } from '@/data/profile-fields';

/**
 * The privacy screen makes promises. These tests are what stop those promises from quietly
 * becoming false as the code changes.
 */

describe('what we disclose', () => {
  it('lists every readable document type', () => {
    // A document type the pipeline can read but the privacy screen omits is an undisclosed
    // collection. The screen is generated from this list precisely so that cannot happen.
    const disclosed = documentsWeRead().map((d) => d.id);
    const readable = documentTypes.filter((t) => t.id !== 'unknown').map((t) => t.id);
    expect(disclosed.sort()).toEqual(readable.sort());
  });

  it('lists every field we retain', () => {
    expect(fieldsWeKeep().map((f) => f.key).sort()).toEqual(
      profileFields.map((f) => f.key).sort(),
    );
  });

  it('collects every never-stored identifier declared anywhere in the registry', () => {
    const declared = new Set(documentTypes.flatMap((t) => t.neverStore ?? []));
    expect(new Set(neverStored())).toEqual(declared);
  });

  it('names the highest-risk identifiers explicitly', () => {
    // These identify exactly the population NYC's Identifying Information Law protects. If one
    // ever stops being declared, that is a decision someone must make deliberately, not a drift.
    const never = neverStored();
    expect(never).toContain('ssn');
    expect(never).toContain('sevisId');
    expect(never).toContain('visaStatus');
  });

  it('has a readable label for every never-stored key', () => {
    // Showing a user the raw key "sevisId" is not disclosure, it is jargon.
    for (const key of neverStored()) {
      const label = labelForNeverStored(key);
      expect(label).not.toBe(key);
      expect(label.length).toBeGreaterThan(3);
    }
  });

  it('does not claim to read a document that yields nothing', () => {
    for (const doc of documentsWeRead()) {
      expect(doc.yields.length + doc.neverStore.length).toBeGreaterThan(0);
    }
  });
});

describe('where a document goes', () => {
  it('is read off the provider that will actually run, not asserted by hand', () => {
    // If these two ever disagree, the privacy screen is describing a reader that is not the one
    // reading the document.
    expect(documentDestination()).toBe(ocrProvider().sendsImagesTo);
  });

  it('is a destination, not a boolean, so the screen can name it', () => {
    // A provider that sends images has to say where. "Somewhere" is not a disclosure.
    const remote = createGeminiProvider({ apiKey: 'test-key' });
    expect(remote.sendsImagesTo).toEqual(expect.stringMatching(/\S/));
  });

  it('is null for every reader that keeps the image on the device', () => {
    // The local providers are the ones allowed to leave the "nowhere" copy standing.
    const local = ocrProvider();
    if (local.name === 'gemini') {
      expect(local.sendsImagesTo).not.toBeNull();
    } else {
      expect(local.sendsImagesTo).toBeNull();
    }
  });
});

describe('the retention promise', () => {
  it('keeps only derived fields, never a document body', () => {
    // The whole extract-then-discard posture rests on this: the set of things retained is the
    // profile field list and nothing else.
    const kept = fieldsWeKeep().map((f) => f.key);
    expect(kept).toHaveLength(profileFields.length);
    expect(kept).not.toContain('documentImage');
    expect(kept).not.toContain('rawText');
  });

  it('never retains a field that is also declared never-stored', () => {
    // A direct contradiction between the two lists would make the privacy screen lie.
    const never = new Set(neverStored());
    for (const field of fieldsWeKeep()) {
      expect(never.has(field.key)).toBe(false);
    }
  });
});
