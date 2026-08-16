import type { ProfileFieldKey } from './profile-fields';

import type { DocumentCategory } from '@/theme';

/**
 * The open registry of documents the pipeline can read.
 *
 * Adding a document type means adding an entry here and a label in `src/i18n/strings.ts` —
 * nothing else. Screens derive everything they show from this table.
 *
 * `unknown` is a real member, not an error case. When the classifier is not confident enough to
 * name a document, it says so and the user picks; guessing would propagate a wrong type into
 * every field extracted from it.
 */

export type DocumentTypeId =
  | 'passport'
  | 'state_id'
  | 'drivers_license'
  | 'idnyc'
  | 'permanent_resident_card'
  | 'i20'
  | 'w2'
  | 'pay_stub'
  | 'tax_return'
  | 'bank_statement'
  | 'benefits_letter'
  | 'lease'
  | 'utility_bill'
  | 'unknown';

export type DocumentTypeDef = {
  id: DocumentTypeId;
  category: DocumentCategory;
  /** Satisfies the identity gate — at least one of these must be on file first. */
  isIdentity: boolean;
  /** Profile fields this document can yield. */
  yields: readonly ProfileFieldKey[];
  /**
   * Present on the document but never persisted. Used in the submission if a program demands
   * it, then dropped. See docs/upload-pipeline.md — "Fields we refuse to store".
   */
  neverStore?: readonly string[];
};

export const documentTypes: readonly DocumentTypeDef[] = [
  {
    id: 'passport',
    category: 'identity',
    isIdentity: true,
    // A passport proves who you are; it says nothing about where you live now.
    yields: ['fullName', 'dob'],
  },
  {
    id: 'state_id',
    category: 'identity',
    isIdentity: true,
    yields: ['fullName', 'dob', 'address'],
  },
  {
    id: 'drivers_license',
    category: 'identity',
    isIdentity: true,
    yields: ['fullName', 'dob', 'address'],
  },
  {
    id: 'idnyc',
    category: 'identity',
    isIdentity: true,
    yields: ['fullName', 'dob', 'address'],
  },
  {
    id: 'permanent_resident_card',
    category: 'identity',
    isIdentity: true,
    yields: ['fullName', 'dob'],
    neverStore: ['alienNumber'],
  },
  {
    id: 'i20',
    category: 'immigration',
    isIdentity: false,
    yields: ['fullName', 'dob'],
    // The highest-risk identifier a user can hand us. Never persisted.
    neverStore: ['sevisId', 'visaStatus'],
  },
  {
    id: 'w2',
    category: 'income',
    isIdentity: false,
    yields: ['fullName', 'income'],
    neverStore: ['ssn'],
  },
  {
    id: 'pay_stub',
    category: 'income',
    isIdentity: false,
    yields: ['fullName', 'income'],
  },
  {
    id: 'tax_return',
    category: 'income',
    isIdentity: false,
    // The only document that authoritatively states household size.
    yields: ['fullName', 'income', 'household'],
    neverStore: ['ssn'],
  },
  {
    id: 'bank_statement',
    category: 'income',
    isIdentity: false,
    yields: ['fullName', 'address', 'income'],
    neverStore: ['accountNumber'],
  },
  {
    id: 'benefits_letter',
    category: 'other',
    isIdentity: false,
    yields: ['fullName', 'address'],
  },
  {
    id: 'lease',
    category: 'residence',
    isIdentity: false,
    yields: ['address', 'household'],
  },
  {
    id: 'utility_bill',
    category: 'residence',
    isIdentity: false,
    yields: ['fullName', 'address'],
  },
  {
    id: 'unknown',
    category: 'other',
    isIdentity: false,
    yields: [],
  },
] as const;

export function documentType(id: DocumentTypeId): DocumentTypeDef {
  const def = documentTypes.find((d) => d.id === id);
  if (!def) throw new Error(`Unknown document type: ${id}`);
  return def;
}

/** Everything a user can pick from when the classifier could not tell. */
export const selectableDocumentTypes = documentTypes.filter((d) => d.id !== 'unknown');

/**
 * Trust order per field, most authoritative first.
 *
 * Address deliberately inverts the usual ranking: a recent utility bill or lease beats a photo
 * ID, because an ID proves who you are and not where you live now. Income ranks a tax return
 * over a W-2 over a pay stub, since each is progressively more extrapolated.
 */
export const fieldAuthority: Record<ProfileFieldKey, readonly DocumentTypeId[]> = {
  fullName: [
    'passport',
    'state_id',
    'drivers_license',
    'permanent_resident_card',
    'idnyc',
    'i20',
    'tax_return',
    'w2',
    'pay_stub',
    'bank_statement',
    'utility_bill',
    'benefits_letter',
  ],
  dob: ['passport', 'state_id', 'drivers_license', 'idnyc', 'permanent_resident_card', 'i20'],
  address: [
    'utility_bill',
    'lease',
    'bank_statement',
    'benefits_letter',
    'state_id',
    'drivers_license',
    'idnyc',
  ],
  income: ['tax_return', 'w2', 'pay_stub', 'bank_statement'],
  household: ['tax_return', 'lease'],
};

/** Lower is more authoritative. `Infinity` means this document cannot speak to the field. */
export function authorityRank(field: ProfileFieldKey, type: DocumentTypeId): number {
  const index = fieldAuthority[field].indexOf(type);
  return index === -1 ? Infinity : index;
}
