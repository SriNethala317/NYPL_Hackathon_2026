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
    requiresSignature: true,
    /*
     * Every value below is read off the form's own "HOW TO APPLY" block, not from a web search or
     * from memory. An earlier draft of this file carried a plausible-looking Manhattan address for
     * the Department of Finance; the form actually directs applications to a PO box in New Jersey.
     * Nobody would have caught that by reading the code, and the failure mode is somebody's rent
     * exemption sitting in a mailroom that has never heard of them.
     *
     * Rule for every template added here: if the form does not print it, we do not claim it.
     *
     * Online leads because the agency itself says "We encourage you to apply online" — their
     * routing preference, not ours to override.
     */
    channels: [
      {
        kind: 'online-portal',
        url: 'https://www.nyc.gov/nyctap',
        instructions:
          'Apply online at nyc.gov/nyctap — the Department of Finance recommends this route.',
      },
      {
        kind: 'mail',
        address: 'NYC Department of Finance, Rent Freeze Program, PO Box 3179, Union, NJ 07083',
        instructions:
          'Print the form, sign it, and post it. You do not need an online account or an email address.',
      },
    ],
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
      /*
       * The phone number is three boxes on this form, not one. Listing only the first meant the
       * applicant found the other two after opening the PDF, having been told the form was ready.
       */
      {
        pdfField: 'area_code',
        source: { from: 'manual', reason: 'Add your phone area code.' },
      },
      {
        pdfField: 'phone1.1',
        source: { from: 'manual', reason: 'Add the first three digits of your phone number.' },
      },
      {
        pdfField: 'phone1.2',
        source: { from: 'manual', reason: 'Add the last four digits of your phone number.' },
      },
      /*
       * Two required tick-boxes. They are radio groups rather than text fields, so nothing can be
       * written into them here — but leaving them off the list entirely meant an applicant could
       * submit the form with its first question unanswered and never be told.
       */
      {
        pdfField: 'sect1_id',
        source: {
          from: 'manual',
          reason: 'Tick whether this is a first application or a renewal.',
        },
      },
      {
        pdfField: 'living_solo',
        source: {
          from: 'manual',
          reason: 'Tick whether you are the only person living in your apartment.',
        },
      },
    ],
  },

  {
    /*
     * Senior Citizen Rent Increase Exemption — 94 fillable fields, verified by downloading the
     * live PDF and running it through pdf-lib.
     *
     * SCRIE and DRIE are the same Department of Finance form family, so the identity field names
     * are nearly identical. That similarity is a trap as much as a shortcut: `phone1.1` on DRIE is
     * `phone_3digits` here, and `email` is `email_address`. Every name below was read off this
     * PDF, not copied across from the template above.
     */
    programId: 'P015en',
    formName: 'SCRIE Initial Application',
    url: 'https://www.nyc.gov/assets/rentfreeze/downloads/pdf/scrie/scrie-initial-application-only.pdf',
    requiresSignature: true,
    /*
     * Post only. Unlike DRIE, this form's "HOW TO APPLY" block offers no online route at all — it
     * gives one PO box and nothing else. Inventing a portal link here to make the screen look
     * richer would be inventing a channel the agency does not operate.
     */
    channels: [
      {
        kind: 'mail',
        address: 'New York City Department of Finance, Rent Freeze Program - SCRIE, P.O. Box 3179, Union, NJ 07083',
        instructions:
          'Post the signed application together with the supporting documents listed in section 6 of the form.',
      },
    ],
    fields: [
      { pdfField: 'name', source: { from: 'profile', key: 'fullName' } },
      { pdfField: 'DOB', source: { from: 'profile', key: 'dob' }, format: 'mmddyyyy' },
      { pdfField: 'street_address', source: { from: 'address', part: 'street' } },
      { pdfField: 'Apt', source: { from: 'address', part: 'apt' } },
      { pdfField: 'city', source: { from: 'address', part: 'city' } },
      { pdfField: 'state', source: { from: 'address', part: 'state' } },
      { pdfField: 'ZIP', source: { from: 'address', part: 'zip' } },
      {
        pdfField: 'SSN',
        source: {
          from: 'manual',
          reason: 'We never store Social Security numbers. Write yours in before you sign.',
        },
      },
      {
        pdfField: 'email_address',
        source: { from: 'manual', reason: 'Add an email address you check.' },
      },
      { pdfField: 'area_code', source: { from: 'manual', reason: 'Add your phone area code.' } },
      {
        pdfField: 'phone_3digits',
        source: { from: 'manual', reason: 'Add the first three digits of your phone number.' },
      },
      {
        pdfField: 'phone_4digits',
        source: { from: 'manual', reason: 'Add the last four digits of your phone number.' },
      },
      /*
       * Income is deliberately left entirely to the applicant, even though a figure is on file.
       *
       * This form does not want one number. It wants last year's income broken out by source —
       * wages, pension, Social Security, IRA, interest, business income, workers' compensation,
       * capital gains, public assistance — for every member of the household, and then a total.
       * Our single reconciled `income` value cannot be decomposed into those boxes, and writing it
       * into `total_income` would produce a figure the applicant then certifies as true under
       * penalty of law without ever having checked it.
       *
       * Eligibility turns on that number: SCRIE requires combined household income under $50,000.
       * A wrong total is not a cosmetic defect — it is either a denial or a false certification.
       */
      {
        pdfField: 'total_income',
        source: {
          from: 'manual',
          reason:
            'Add last year’s income for everyone in your home, broken down by source in section 3. We cannot work this out for you.',
        },
      },
      {
        pdfField: 'income_rent_amt',
        source: { from: 'manual', reason: 'Add your current monthly rent.' },
      },
      {
        pdfField: 'apartment_type',
        source: { from: 'manual', reason: 'Tick what kind of apartment you live in.' },
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
