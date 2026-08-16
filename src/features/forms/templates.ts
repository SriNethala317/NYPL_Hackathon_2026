import type { FormTemplate } from './types';

/**
 * The government forms this app can fill.
 *
 * Every `pdfField` below was read off the real PDF with
 * `node scripts/inspect-form.mjs <url>`. Adding a programme means running that, reading the
 * field names, and writing the mapping — never guessing, because a wrong field name yields a
 * form that looks complete and is not.
 *
 * Only a fraction of the catalogue has a fillable PDF at all. Of the 97 programmes, 10 publish a
 * PDF link, and several of those links are already dead or serve flat scans with no form fields.
 * `fetchTemplate` treats that as an expected condition rather than an error.
 */

export const formTemplates: readonly FormTemplate[] = [
  {
    // Disability Rent Increase Exemption — 48 fillable fields, verified.
    programId: 'P005en',
    formName: 'DRIE Initial Application',
    url: 'https://www.nyc.gov/assets/rentfreeze/downloads/pdf/drie/drie-application.pdf',
    submission: {
      kind: 'online-portal',
      url: 'https://www.nyc.gov/site/rentfreeze/index.page',
      instructions:
        'Print and sign the completed form, then submit it through the NYC Rent Freeze portal or mail it to the Department of Finance.',
    },
    fields: [
      { pdfField: 'name', source: { from: 'profile', key: 'fullName' } },
      { pdfField: 'DOB', source: { from: 'profile', key: 'dob' }, format: 'mmddyyyy' },
      { pdfField: 'address', source: { from: 'address', part: 'street' } },
      { pdfField: 'apt', source: { from: 'address', part: 'apt' } },
      { pdfField: 'city', source: { from: 'address', part: 'city' } },
      { pdfField: 'state', source: { from: 'address', part: 'state' } },
      { pdfField: 'zip', source: { from: 'address', part: 'zip' } },
      { pdfField: 'date', source: { from: 'today' } },
      { pdfField: 'section3_name', source: { from: 'profile', key: 'fullName' } },
      { pdfField: 'section3_date1', source: { from: 'today' } },
      /*
       * The form asks for an SSN. We do not hold one and are not going to start: it is the single
       * most damaging field in a breach, and a box on a PDF is not a reason to retain it. The
       * applicant writes it in before signing.
       */
      {
        pdfField: 'ssn',
        source: {
          from: 'manual',
          reason: 'We never store Social Security numbers. Write yours in before you sign.',
        },
      },
      {
        pdfField: 'email',
        source: { from: 'manual', reason: 'Add an email address you check.' },
      },
      {
        pdfField: 'phone1.1',
        source: { from: 'manual', reason: 'Add a phone number the agency can reach you on.' },
      },
    ],
  },
];

export function templateFor(programId: string): FormTemplate | undefined {
  return formTemplates.find((template) => template.programId === programId);
}

export function hasTemplate(programId: string): boolean {
  return formTemplates.some((template) => template.programId === programId);
}
