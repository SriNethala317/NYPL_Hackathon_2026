import type { DocumentKind } from '@/theme';

/**
 * The Master Profile — every field an application can ask for, and where it comes from.
 *
 * This mirrors the extraction architecture column-for-column, so the eventual
 * upload → OCR → LLM → database pipeline can populate it without the screens changing:
 *
 *   source       → Primary Document Source (which upload yields this field)
 *   extractable  → whether OCR can read it, or the user must answer
 *   mandatory    → required to submit, vs. an optional parameter
 *   note         → extraction logic: where it sits on the page, or how it is derived
 *
 * Values currently come from `sampleProfile`; nothing here assumes that.
 */

export type ProfileFieldKey = 'fullName' | 'dob' | 'address' | 'household' | 'income';

export type ProfileFieldDef = {
  key: ProfileFieldKey;
  /** The document this field is read from. `null` means it cannot be extracted at all. */
  source: DocumentKind | null;
  extractable: boolean;
  mandatory: boolean;
  /** Kept beside the field so the extraction logic cannot drift away from the schema. */
  note: string;
  keyboard: 'default' | 'numeric';
};

export const profileFields: readonly ProfileFieldDef[] = [
  {
    key: 'fullName',
    source: 'id',
    extractable: true,
    mandatory: true,
    note: 'Read from the name line of the photo ID.',
    keyboard: 'default',
  },
  {
    key: 'dob',
    source: 'id',
    extractable: true,
    mandatory: true,
    note: 'Read from the date-of-birth line of the photo ID. Normalized to MM/DD/YYYY.',
    keyboard: 'default',
  },
  {
    key: 'address',
    source: 'address',
    extractable: true,
    mandatory: true,
    // Borough is never asked for — it falls out of the ZIP.
    note: 'Read from the proof of address. Borough is derived from the ZIP, not asked.',
    keyboard: 'default',
  },
  {
    key: 'household',
    source: 'lease',
    // A lease lists occupants too inconsistently to trust OCR here.
    extractable: false,
    mandatory: true,
    note: 'Not reliably extractable. Falls back to a one-tap choice when no tax return is on file.',
    keyboard: 'numeric',
  },
  {
    key: 'income',
    source: 'income',
    extractable: true,
    mandatory: true,
    note: 'Gross monthly income, averaged from the most recent pay stubs.',
    keyboard: 'numeric',
  },
] as const;

export function fieldDef(key: ProfileFieldKey): ProfileFieldDef {
  const def = profileFields.find((f) => f.key === key);
  if (!def) throw new Error(`Unknown profile field: ${key}`);
  return def;
}

/**
 * NYC borough from ZIP — the derivation named in the extraction notes.
 *
 * Ranges are deliberately coarse. The real pipeline should resolve this server-side against the
 * official ZIP-to-borough table rather than trust these bounds; a wrong borough can misroute an
 * application.
 */
export function boroughFromZip(zip: string): string | null {
  const n = Number(zip);
  if (!Number.isFinite(n)) return null;
  if (n >= 10001 && n <= 10282) return 'Manhattan';
  if (n >= 10301 && n <= 10314) return 'Staten Island';
  if (n >= 10451 && n <= 10475) return 'Bronx';
  if (n >= 11004 && n <= 11109) return 'Queens';
  if (n >= 11201 && n <= 11256) return 'Brooklyn';
  if (n >= 11351 && n <= 11697) return 'Queens';
  return null;
}
