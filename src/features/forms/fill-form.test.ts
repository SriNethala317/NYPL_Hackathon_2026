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
      expect(template.channels.length).toBeGreaterThan(0);
      for (const channel of template.channels) {
        expect(channel.instructions.length).toBeGreaterThan(20);
      }
      expect(template.url).toMatch(/^https:\/\//);
    }
  });

  /*
   * A mailing address invented from memory looks exactly like one read off the form, and the
   * failure lands on the applicant rather than on us — their application sits in a mailroom that
   * has never heard of them, and they find out weeks later, if at all.
   *
   * An earlier draft of the DRIE template carried a plausible Manhattan address for the
   * Department of Finance. The form directs applications to a PO box in New Jersey.
   */
  it('sends post only to an address printed on the form itself', () => {
    const drieMail = drie.channels.find((channel) => channel.kind === 'mail');
    expect(drieMail).toBeDefined();
    expect(drieMail?.kind === 'mail' && drieMail.address).toBe(
      'NYC Department of Finance, Rent Freeze Program, PO Box 3179, Union, NJ 07083',
    );
  });

  it('offers a route that needs no online account', () => {
    // The whole point of keeping paper as a first-class channel: someone with no email address
    // and no portal login can still finish.
    for (const template of formTemplates) {
      const offline = template.channels.filter((channel) =>
        ['mail', 'fax', 'in-person'].includes(channel.kind),
      );
      expect(offline.length).toBeGreaterThan(0);
    }
  });

  /*
   * The check that catches an agency reissuing a form with renamed fields. Without it, a mapping
   * silently stops matching and the applicant submits a half-empty form.
   *
   * Every template must appear here. SCRIE and DRIE are the same Department of Finance form
   * family with nearly identical field names — `email` versus `email_address`, `phone1.1` versus
   * `phone_3digits` — which is exactly the situation where a mapping copied across from its
   * sibling looks right and writes nothing.
   */
  it.each([
    ['DRIE', 'P005en', 'drie-application.pdf'],
    ['SCRIE', 'P015en', 'scrie-application.pdf'],
    ['IDNYC', 'P032en', 'idnyc-application.pdf'],
  ])('maps only field names that exist on the real %s PDF', async (_name, programId, fixture) => {
    const template = formTemplates.find((t) => t.programId === programId);
    expect(template).toBeDefined();

    const bytes = readFileSync(join(__dirname, '__fixtures__', fixture));
    const doc = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    });
    const actual = new Set(doc.getForm().getFields().map((f) => f.getName()));

    for (const mapping of template!.fields) {
      expect(actual.has(mapping.pdfField)).toBe(true);
    }
  });

  it('never maps a profile value into a field we refuse to hold', () => {
    // A form asking for an SSN is not a reason to start storing one. Every such box must be
    // `manual`, on every template, so the applicant writes it in themselves.
    for (const template of formTemplates) {
      for (const mapping of template.fields) {
        if (/ssn|social.?security/i.test(mapping.pdfField)) {
          expect(mapping.source.from).toBe('manual');
        }
      }
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

/**
 * IDNYC filled from a driver's licence — the path a real person actually walks.
 *
 * The values here are exactly what the vision model returned from a photographed ID: one name
 * string, one date, one address line. Everything the form needs beyond that has to be derived,
 * and what cannot be derived has to stay visibly empty.
 */
describe('IDNYC, from a licence and nothing else', () => {
  const IDNYC = readFileSync(join(__dirname, '__fixtures__', 'idnyc-application.pdf'));
  const idnyc = formTemplates.find((t) => t.programId === 'P032en')!;

  const FROM_LICENCE: ProfileValues = {
    fullName: 'MARIA REYES',
    dob: '04/18/1991',
    address: '1240 GRAND CONCOURSE, BRONX, NY 10456',
  };

  it('splits the one name a licence prints into the boxes the form has', async () => {
    const result = await fillForm(idnyc, IDNYC, FROM_LICENCE);

    expect(await readBack(result.bytes, 'First Name')).toBe('MARIA');
    expect(await readBack(result.bytes, 'Last Name')).toBe('REYES');
  });

  it('splits the one address line into street, city and ZIP', async () => {
    const result = await fillForm(idnyc, IDNYC, FROM_LICENCE);

    expect(await readBack(result.bytes, 'Address')).toBe('1240 GRAND CONCOURSE');
    expect(await readBack(result.bytes, 'City')).toBe('BRONX');
    expect(await readBack(result.bytes, 'Zip Code')).toBe('10456');
    expect(await readBack(result.bytes, 'Date of Birth')).toBe('04/18/1991');
  });

  it('ticks only the borough the applicant lives in', async () => {
    const result = await fillForm(idnyc, IDNYC, FROM_LICENCE);
    const doc = await PDFDocument.load(result.bytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    });
    const form = doc.getForm();

    expect(form.getCheckBox('Bronx').isChecked()).toBe(true);
    for (const other of ['Brooklyn', 'Manhattan', 'Queens', 'Staten Island']) {
      expect(form.getCheckBox(other).isChecked()).toBe(false);
    }
  });

  it('does not count the four unticked boroughs as failures', async () => {
    // They are correctly empty. Reporting them as "we could not fill this" would tell somebody
    // four things went wrong on a form that is exactly right.
    const result = await fillForm(idnyc, IDNYC, FROM_LICENCE);

    const skipped = result.fields.filter((f) => f.status === 'skip');
    expect(skipped).toHaveLength(4);
    expect(skipped.map((f) => f.pdfField).sort()).toEqual([
      'Brooklyn',
      'Manhattan',
      'Queens',
      'Staten Island',
    ]);

    /*
     * The one genuine gap is APT, and it stays a gap on purpose: this address carries no
     * apartment number, and "they do not live in a flat" is indistinguishable from "we could not
     * read it". Reporting it lets the applicant confirm, which is the right outcome — the four
     * boroughs are the ones that must not be counted, because they are correct as they are.
     */
    expect(result.fields.filter((f) => f.status === 'missing').map((f) => f.pdfField)).toEqual([
      'APT',
    ]);
  });

  it('refuses to split a name it cannot split safely', async () => {
    /*
     * "María García Piñedo" is either a first name, a middle name and a surname, or a first name
     * and two surnames — and the two look identical. Guessing drops half of somebody's family
     * name off an identity application.
     */
    const result = await fillForm(idnyc, IDNYC, {
      ...FROM_LICENCE,
      fullName: 'Maria Garcia Pinedo',
    });

    expect(await readBack(result.bytes, 'First Name')).toBe('');
    expect(await readBack(result.bytes, 'Last Name')).toBe('');
    const first = result.fields.find((f) => f.pdfField === 'First Name');
    expect(first?.status).toBe('manual');
  });

  it('keeps a family-name particle with the surname', async () => {
    const result = await fillForm(idnyc, IDNYC, { ...FROM_LICENCE, fullName: 'Maria de la Cruz' });

    expect(await readBack(result.bytes, 'First Name')).toBe('Maria');
    expect(await readBack(result.bytes, 'Last Name')).toBe('de la Cruz');
  });

  it('does not claim the form can be posted', () => {
    // IDNYC photographs the applicant and checks original documents, so it is finished in person.
    // Telling someone to post it would send them to a post box with a form nobody will read.
    expect(idnyc.channels[0].kind).toBe('in-person');
    expect(idnyc.channels.some((c) => c.kind === 'mail')).toBe(false);
  });
});

/**
 * The borough box, from an address as documents actually print it.
 *
 * Manhattan is the trap: a licence, a utility bill and an envelope all say "NEW YORK, NY", almost
 * never "Manhattan, NY". Matching the city against the checkbox label directly meant a real
 * Manhattan resident had no borough ticked and no indication why.
 */
describe('working out the borough', () => {
  const IDNYC = readFileSync(join(__dirname, '__fixtures__', 'idnyc-application.pdf'));
  const idnyc = formTemplates.find((t) => t.programId === 'P032en')!;

  async function ticked(address: string): Promise<string[]> {
    const result = await fillForm(idnyc, IDNYC, { fullName: 'Ana Ruiz', address });
    const doc = await PDFDocument.load(result.bytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    });
    const form = doc.getForm();
    return ['Bronx', 'Brooklyn', 'Manhattan', 'Queens', 'Staten Island'].filter((b) =>
      form.getCheckBox(b).isChecked(),
    );
  }

  it.each([
    ['99 Fictional Avenue, New York, NY 10001', 'Manhattan'],
    ['99 Fictional Avenue, Manhattan, NY 10001', 'Manhattan'],
    ['1240 Grand Concourse, Bronx, NY 10456', 'Bronx'],
    ['200 Example Street, Brooklyn, NY 11201', 'Brooklyn'],
    ['5 Sample Road, Queens, NY 11101', 'Queens'],
    ['7 Test Lane, Staten Island, NY 10301', 'Staten Island'],
  ])('ticks %s as %s', async (address, borough) => {
    expect(await ticked(address)).toEqual([borough]);
  });

  it('ticks nothing for an address outside the five boroughs', async () => {
    // Somebody can move to the city and still be holding out-of-state ID, so this is a real
    // answer rather than an error — and a wrongly ticked borough is a false statement they sign.
    expect(await ticked('1511 Foxboro Ct, Bentonville, AR 72712')).toEqual([]);
  });

  it('tells the applicant to tick it themselves when it cannot be worked out', async () => {
    const result = await fillForm(idnyc, IDNYC, { fullName: 'Ana Ruiz', address: '' });
    const bronx = result.fields.find((f) => f.pdfField === 'Bronx');

    expect(bronx?.status).toBe('manual');
    expect(bronx?.note).toMatch(/tick the borough/i);
  });
});
