import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PDFDocument } from 'pdf-lib';

import { fillForm } from './fill-form';
import { programById, programs } from '@/data/catalogue';
import { formTemplates, templateFor } from './templates';

import type { ProfileValues } from './fill-form';

/**
 * Fills the real Disability Rent Increase Exemption form.
 *
 * The fixture is the actual PDF the City publishes, so this exercises a genuine government form
 * with its genuine field names rather than a mock that would agree with whatever we wrote.
 */

const BLANK = readFileSync(join(__dirname, '__fixtures__', 'drie-application.pdf'));
const drie = formTemplates[0];

const MARIA: ProfileValues = {
  fullName: 'Maria Reyes',
  dob: '4/18/1991',
  address: '1240 Grand Concourse, Apt 4B, Bronx, NY 10456',
  household: '3',
  income: '2310',
};

/** Reads a field back out of the produced PDF — the only proof that a value really landed. */
async function readBack(bytes: Uint8Array, field: string): Promise<string> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false });
  return doc.getForm().getTextField(field).getText() ?? '';
}

describe('filling a real government form', () => {
  it('writes the applicant’s details into the actual PDF fields', async () => {
    const result = await fillForm(drie, BLANK, MARIA, { now: new Date(2026, 7, 16) });

    expect(await readBack(result.bytes, 'name')).toBe('Maria Reyes');
    expect(await readBack(result.bytes, 'DOB')).toBe('04/18/1991');
    expect(await readBack(result.bytes, 'date')).toBe('08/16/2026');
  });

  it('splits a one-line address into the boxes the form actually has', async () => {
    const result = await fillForm(drie, BLANK, MARIA);

    expect(await readBack(result.bytes, 'address')).toBe('1240 Grand Concourse');
    expect(await readBack(result.bytes, 'apt')).toBe('4B');
    expect(await readBack(result.bytes, 'city')).toBe('Bronx');
    expect(await readBack(result.bytes, 'state')).toBe('NY');
    expect(await readBack(result.bytes, 'zip')).toBe('10456');
  });

  it('leaves the SSN box empty and says why', async () => {
    // A box on a PDF is not a reason to start holding Social Security numbers.
    const result = await fillForm(drie, BLANK, MARIA);

    expect(await readBack(result.bytes, 'ssn')).toBe('');
    const ssn = result.fields.find((f) => f.pdfField === 'ssn');
    expect(ssn?.status).toBe('manual');
    expect(ssn?.note).toMatch(/never store/i);
  });

  it('reports what is filled and what the applicant still has to do', async () => {
    const result = await fillForm(drie, BLANK, MARIA);

    expect(result.filledCount).toBeGreaterThan(5);
    expect(result.manualCount).toBeGreaterThan(0);
    // Every mapped field is accounted for; nothing vanishes silently.
    expect(result.fields).toHaveLength(drie.fields.length);
  });

  it('leaves a field blank rather than guessing when data is missing', async () => {
    const result = await fillForm(drie, BLANK, { fullName: 'Maria Reyes' });

    expect(await readBack(result.bytes, 'DOB')).toBe('');
    expect(await readBack(result.bytes, 'city')).toBe('');
    expect(result.missingCount).toBeGreaterThan(0);
    // The one value we did have still goes in.
    expect(await readBack(result.bytes, 'name')).toBe('Maria Reyes');
  });

  it('produces a PDF that is still a PDF', async () => {
    const result = await fillForm(drie, BLANK, MARIA);
    expect(String.fromCharCode(...result.bytes.slice(0, 4))).toBe('%PDF');
  });

  it('leaves the form editable so it can be completed and signed', async () => {
    // Flattening would lock the applicant out of the fields we deliberately left for them.
    const result = await fillForm(drie, BLANK, MARIA);
    const doc = await PDFDocument.load(result.bytes, { ignoreEncryption: true, throwOnInvalidObject: false });
    expect(doc.getForm().getFields().length).toBeGreaterThan(0);
  });

  it('survives an empty profile without throwing', async () => {
    const result = await fillForm(drie, BLANK, {});
    expect(result.filledCount).toBeGreaterThan(0); // the date still fills
    expect(result.missingCount).toBeGreaterThan(0);
  });
});

describe('the template registry', () => {
  it('finds a template by programme id', () => {
    expect(templateFor(drie.programId)?.formName).toBe(drie.formName);
  });

  it('returns nothing for a programme with no form', () => {
    expect(templateFor('not-a-programme')).toBeUndefined();
  });

  it('points every template at a programme that actually exists', () => {
    // A mistyped id does not fail loudly -- the form button simply never appears, and the
    // feature looks unbuilt rather than broken.
    const known = new Set(programs.map((p) => p.id));
    for (const template of formTemplates) {
      expect(known.has(template.programId)).toBe(true);
    }
  });

  it('matches the programme the form actually belongs to', () => {
    expect(programById(drie.programId)?.name).toMatch(/rent increase exemption/i);
  });

  it('tells the applicant where the finished form goes', () => {
    for (const template of formTemplates) {
      expect(template.submission.instructions.length).toBeGreaterThan(20);
      expect(template.url).toMatch(/^https:\/\//);
    }
  });

  it('maps only field names that exist on the real PDF', async () => {
    // The check that catches an agency reissuing a form with renamed fields. Without it, a
    // mapping silently stops matching and the applicant submits a half-empty form.
    const doc = await PDFDocument.load(BLANK, { ignoreEncryption: true, throwOnInvalidObject: false });
    const actual = new Set(doc.getForm().getFields().map((f) => f.getName()));

    for (const mapping of drie.fields) {
      expect(actual.has(mapping.pdfField)).toBe(true);
    }
  });
});

/**
 * Regressions from the independent form audit. Each was a way to hand somebody a wrong or
 * missing government form without telling them.
 */
describe('names the standard PDF font cannot print', () => {
  it.each([
    ['Cyrillic', 'Владимир Петров'],
    ['Chinese', '王小明'],
    ['Arabic', 'محمد أحمد'],
    ['Korean', '정민준'],
  ])('produces a form for a %s name instead of failing', async (_script, fullName) => {
    // pdf-lib's default WinAnsi font cannot encode these. The whole form used to throw, and the
    // screen blamed the agency's link -- permanently, for a large share of this app's users.
    const result = await fillForm(drie, BLANK, { ...MARIA, fullName });

    expect(String.fromCharCode(...result.bytes.slice(0, 4))).toBe('%PDF');
    const name = result.fields.find((f) => f.pdfField === 'name');
    expect(name?.status).toBe('manual');
    expect(name?.note).toMatch(/write this box in yourself/i);
    // The rest of the form still fills; only the one box falls back.
    expect(await readBack(result.bytes, 'city')).toBe('Bronx');
  });

  it('still fills accented Latin names normally', async () => {
    const result = await fillForm(drie, BLANK, { ...MARIA, fullName: 'José Ñáñez' });
    expect(await readBack(result.bytes, 'name')).toBe('José Ñáñez');
  });
});

describe('dates that are not real dates', () => {
  it.each(['13/40/1991', '1991-04-18', '04/18/91', '02/30/1991'])(
    'refuses to write %s onto a signed form',
    async (dob) => {
      const result = await fillForm(drie, BLANK, { ...MARIA, dob });

      expect(await readBack(result.bytes, 'DOB')).toBe('');
      expect(result.fields.find((f) => f.pdfField === 'DOB')?.status).toBe('manual');
    },
  );

  it('accepts a real leap day', async () => {
    const result = await fillForm(drie, BLANK, { ...MARIA, dob: '2/29/2000' });
    expect(await readBack(result.bytes, 'DOB')).toBe('02/29/2000');
  });
});

describe('every required box is accounted for', () => {
  it('tells the applicant about the tick-boxes it cannot fill', async () => {
    // These are radio groups. Omitting them entirely let someone submit the form with its first
    // question blank, having been told it was ready.
    const result = await fillForm(drie, BLANK, MARIA);
    const manual = result.fields.filter((f) => f.status === 'manual').map((f) => f.pdfField);

    expect(manual).toEqual(expect.arrayContaining(['sect1_id', 'living_solo']));
  });

  it('lists all three phone boxes, not just the first', async () => {
    const result = await fillForm(drie, BLANK, MARIA);
    const manual = result.fields.filter((f) => f.status === 'manual').map((f) => f.pdfField);

    expect(manual).toEqual(expect.arrayContaining(['area_code', 'phone1.1', 'phone1.2']));
  });
});
