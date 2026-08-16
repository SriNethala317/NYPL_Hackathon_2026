import type { DocumentCategory } from '@/theme';

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
  /**
   * The kind of proof this field comes from, not a specific file. Any document in the category
   * can supply it — a W-2, a pay stub and a tax return all prove income.
   */
  source: DocumentCategory | null;
  extractable: boolean;
  mandatory: boolean;
  /** Kept beside the field so the extraction logic cannot drift away from the schema. */
  note: string;
  keyboard: 'default' | 'numeric';
  /**
   * Whether a newer document legitimately supersedes an older one.
   *
   * People move and their pay changes, so a recent document simply wins for those fields. A
   * legal name or date of birth should not drift — a disagreement there means an OCR error or
   * a different person, and both are worth stopping to ask about rather than silently picking.
   */
  timeVarying: boolean;
};

export const profileFields: readonly ProfileFieldDef[] = [
  {
    key: 'fullName',
    source: 'identity',
    extractable: true,
    mandatory: true,
    note: 'Read from the name line of the photo ID.',
    keyboard: 'default',
    timeVarying: false,
  },
  {
    key: 'dob',
    source: 'identity',
    extractable: true,
    mandatory: true,
    note: 'Read from the date-of-birth line of the photo ID. Normalized to MM/DD/YYYY.',
    keyboard: 'default',
    timeVarying: false,
  },
  {
    key: 'address',
    source: 'residence',
    extractable: true,
    mandatory: true,
    // Borough is never asked for — it falls out of the ZIP.
    note: 'Read from the proof of address. Borough is derived from the ZIP, not asked.',
    keyboard: 'default',
    timeVarying: true,
  },
  {
    key: 'household',
    source: 'residence',
    // A lease lists occupants too inconsistently to trust OCR here.
    extractable: false,
    mandatory: true,
    note: 'Not reliably extractable. Falls back to a one-tap choice when no tax return is on file.',
    keyboard: 'numeric',
    timeVarying: true,
  },
  {
    key: 'income',
    source: 'income',
    extractable: true,
    mandatory: true,
    note: 'Gross monthly income, averaged from the most recent pay stubs.',
    keyboard: 'numeric',
    timeVarying: true,
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
