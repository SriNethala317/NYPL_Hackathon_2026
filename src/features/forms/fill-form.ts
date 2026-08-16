import { PDFDocument } from 'pdf-lib';

import { parseAddress } from './address';
import type { FieldMapping, FieldSource, FilledField, FillResult, FormTemplate } from './types';

import type { ProfileFieldKey } from '@/data/profile-fields';

/**
 * Filling a real government PDF with the applicant's data.
 *
 * Two rules run through this file:
 *
 *   1. **Never write a value we are not sure of.** A blank box is obvious and gets completed by
 *      hand; a confidently wrong one gets signed. The applicant is certifying this form is true,
 *      so an invented value is their misrepresentation, not ours.
 *   2. **Report exactly what happened.** The result lists every field, what went in it, and why
 *      anything was left — so the screen can say "9 filled, 3 for you to complete" instead of
 *      implying the form is ready to send.
 *
 * The form is left editable rather than flattened, because the applicant still has to add the
 * fields we refuse to hold and then sign it.
 */

export type ProfileValues = Partial<Record<ProfileFieldKey, string>>;

/**
 * Whether pdf-lib's standard font can render this text.
 *
 * AcroForm text fields use WinAnsi (cp1252) by default, which covers Latin-1 and nothing else.
 * Writing a Cyrillic, CJK, Arabic or Korean name made `doc.save()` throw, the whole form fail,
 * and the screen report it as "the agency's link is not working" — a permanent, misdiagnosed
 * denial of the core feature for a large share of the people this app exists for.
 *
 * Detecting it per value lets that one box fall back to hand-completion while the rest of the
 * form still fills. Embedding a Unicode font would be better and is the real fix; it needs a
 * font with the right glyph coverage, which is a bigger change than this.
 */
function isWinAnsiEncodable(value: string): boolean {
  // cp1252 is Latin-1 plus a handful of printable characters in 0x80–0x9F.
  return /^[\u0000-\u00FF\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]*$/.test(
    value,
  );
}

/** A real calendar date, not merely digit-shaped. */
function isRealDate(month: number, day: number, year: number): boolean {
  if (month < 1 || month > 12 || day < 1 || year < 1900 || year > 2200) return false;
  return day <= new Date(year, month, 0).getDate();
}

/** MM/DD/YYYY, which is what every form here wants. */
function formatDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${date.getFullYear()}`;
}

/**
 * Reformats a value, or reports that it cannot be trusted on a signed form.
 *
 * Returns `null` rather than passing an unrecognised date through untouched. "13/40/1991" and
 * "1991-04-18" were both being written verbatim into a date-of-birth box on a document signed
 * under penalty of law.
 */
function applyFormat(value: string, format: FieldMapping['format']): string | null {
  if (format === 'digits') return value.replace(/\D/g, '');

  if (format === 'mmddyyyy') {
    const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (!match) return null;
    const [, month, day, year] = match;
    if (!isRealDate(Number(month), Number(day), Number(year))) return null;
    return `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
  }

  return value;
}

/** Resolves one mapping to a value, or explains why there isn't one. */
function resolve(
  source: FieldSource,
  values: ProfileValues,
  now: Date,
): { value?: string; status: FilledField['status']; note?: string } {
  switch (source.from) {
    case 'profile': {
      const value = values[source.key]?.trim();
      return value
        ? { value, status: 'filled' }
        : { status: 'missing', note: `We do not have your ${source.key} yet.` };
    }
    case 'address': {
      const part = parseAddress(values.address)[source.part];
      return part
        ? { value: part, status: 'filled' }
        : { status: 'missing', note: 'We could not read this part of your address.' };
    }
    case 'today':
      return { value: formatDate(now), status: 'filled' };
    case 'constant':
      return { value: source.value, status: 'filled' };
    case 'manual':
      return { status: 'manual', note: source.reason };
  }
}

export type FillOptions = {
  /** Overridable so tests are not time-dependent. */
  now?: Date;
};

/**
 * Fills a template's fields into the supplied blank PDF.
 *
 * Takes bytes rather than fetching, so the pure logic stays testable and the caller decides how
 * the file arrives — over the network on device, off disk in a test.
 */
export async function fillForm(
  template: FormTemplate,
  pdfBytes: Uint8Array,
  values: ProfileValues,
  options: FillOptions = {},
): Promise<FillResult> {
  const now = options.now ?? new Date();

  // `throwOnInvalidObject: false` because government PDFs are routinely produced by tools that
  // emit slightly malformed cross-reference entries. They render and fill correctly regardless,
  // and refusing them would rule out most of the catalogue.
  const doc = await PDFDocument.load(pdfBytes, {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
  });
  const form = doc.getForm();

  const results: FilledField[] = [];

  for (const mapping of template.fields) {
    const outcome = resolve(mapping.source, values, now);

    if (outcome.status !== 'filled' || !outcome.value) {
      results.push({ pdfField: mapping.pdfField, status: outcome.status, note: outcome.note });
      continue;
    }

    const text = applyFormat(outcome.value, mapping.format);

    if (text === null) {
      results.push({
        pdfField: mapping.pdfField,
        status: 'manual',
        note: 'We could not read this as a date. Write it in yourself before you sign.',
      });
      continue;
    }

    if (!isWinAnsiEncodable(text)) {
      // One box the applicant completes by hand, rather than the entire form failing.
      results.push({
        pdfField: mapping.pdfField,
        status: 'manual',
        note: 'This form cannot print those characters. Write this box in yourself before you sign.',
      });
      continue;
    }

    try {
      form.getTextField(mapping.pdfField).setText(text);
      results.push({ pdfField: mapping.pdfField, value: text, status: 'filled' });
    } catch {
      /*
       * The field is missing or is not a text field. This happens when an agency reissues a form
       * with renamed fields — surfaced rather than swallowed, because a mapping that has quietly
       * stopped matching is how a form ends up submitted half-empty.
       */
      results.push({
        pdfField: mapping.pdfField,
        status: 'unknown-field',
        note: 'This form no longer has that field. The mapping needs updating.',
      });
    }
  }

  /*
   * Saving can still fail on a form whose own default appearance references a glyph we cannot
   * supply. Letting that propagate would surface as "the agency's link is not working", which is
   * both wrong and unfixable by the applicant.
   */
  let bytes: Uint8Array;
  try {
    bytes = await doc.save();
  } catch (error) {
    throw new Error(`This form could not be generated with the details provided: ${String(error)}`);
  }

  return {
    bytes,
    fields: results,
    filledCount: results.filter((f) => f.status === 'filled').length,
    manualCount: results.filter((f) => f.status === 'manual').length,
    missingCount: results.filter((f) => f.status === 'missing' || f.status === 'unknown-field').length,
  };
}

const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

export type TemplateFetch =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: 'not-found' | 'blocked' | 'not-a-pdf' | 'network'; detail: string };

/**
 * Downloads a blank form.
 *
 * Link rot is the normal case, not an edge case: several PDF URLs in the City's own dataset are
 * already dead, and one host serves an HTML error page under a 200. Both are reported as
 * outcomes so the UI can fall back to the programme's apply page instead of showing a crash.
 */
export async function fetchTemplate(url: string): Promise<TemplateFetch> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/pdf,*/*' },
      redirect: 'follow',
    });

    if (response.status === 404) return { ok: false, reason: 'not-found', detail: url };
    if (response.status === 403) return { ok: false, reason: 'blocked', detail: url };
    if (!response.ok) {
      return { ok: false, reason: 'network', detail: `${response.status} ${response.statusText}` };
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    // A blocked or redirected request often returns HTML with a 200 status.
    if (String.fromCharCode(...bytes.slice(0, 4)) !== '%PDF') {
      return { ok: false, reason: 'not-a-pdf', detail: url };
    }
    return { ok: true, bytes };
  } catch (error) {
    return { ok: false, reason: 'network', detail: String(error) };
  }
}
