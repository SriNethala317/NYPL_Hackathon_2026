import { documentTypes } from './document-types';
import { profileFields } from './profile-fields';

/**
 * What the app actually does with a person's data, derived from the code that does it.
 *
 * This is the single source for the privacy screen. It is computed from the document registry and
 * the profile schema rather than written by hand, so the promises on that screen cannot drift out
 * of step with the implementation: add a document type that reads a new sensitive identifier and
 * it appears in the disclosure automatically. A test asserts exactly that.
 *
 * The audience is the point. Research on NYC benefits uptake found roughly 25,000 more eligible
 * non-citizens left the SNAP caseload between 2017 and 2019 than expected, attributed to
 * public-charge chilling effects. For people deciding whether it is safe to hand over an ID, a
 * vague reassurance is worthless and a checkable list is the whole argument.
 */

/** Every document the pipeline can read, and what it takes from each. */
export function documentsWeRead() {
  return documentTypes
    .filter((type) => type.id !== 'unknown')
    .map((type) => ({
      id: type.id,
      category: type.category,
      yields: [...type.yields],
      neverStore: [...(type.neverStore ?? [])],
    }));
}

/** The fields kept after a document is read. This is the complete list; there is no other store. */
export function fieldsWeKeep() {
  return profileFields.map((field) => ({
    key: field.key,
    source: field.source,
    extractable: field.extractable,
  }));
}

/**
 * Identifiers this app refuses to touch.
 *
 * SSN, SEVIS ID and visa status identify precisely the population NYC's Identifying Information
 * Law (Local Law 245 of 2017) is written to protect.
 *
 * Note what this is and is not: extraction never attempts these fields at all — `field-matchers`
 * has no label for any of them — so they are never captured, rather than captured and discarded.
 * That is the stronger position, and the wording on the privacy screen says so. An earlier
 * version described a "read it, use it, drop it" mechanism that does not exist in the code.
 */
export function neverStored(): string[] {
  const all = documentTypes.flatMap((type) => type.neverStore ?? []);
  return [...new Set(all)].sort();
}

/** Human-readable labels for the raw `neverStore` keys. */
export const neverStoredLabels: Record<string, string> = {
  ssn: 'Social Security number',
  sevisId: 'SEVIS ID',
  visaStatus: 'Visa status',
  alienNumber: 'Alien registration number',
  accountNumber: 'Bank account number',
};

export function labelForNeverStored(key: string): string {
  return neverStoredLabels[key] ?? key;
}
