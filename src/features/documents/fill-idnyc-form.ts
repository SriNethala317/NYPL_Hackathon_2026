import { PDFDocument } from 'pdf-lib';

import {
  BoroughExportValue,
  EyeColorExportValue,
  GenderExportValue,
  IdNycFormField,
} from './idnyc-form-fields';
import type { Profile } from './profile';

export type IdNycApplicationType =
  | 'new'
  | 'reapplication'
  | 'renewal'
  | 'updateCard'
  | 'replaceCard';

export interface FillIdNycFormOptions {
  /** Which "APPLICATION TYPE" box to check. Defaults to 'new'. */
  applicationType?: IdNycApplicationType;
}

const applicationTypeField: Record<IdNycApplicationType, string> = {
  new: IdNycFormField.applicationTypeNew,
  reapplication: IdNycFormField.applicationTypeReapplication,
  renewal: IdNycFormField.applicationTypeRenewal,
  updateCard: IdNycFormField.applicationTypeUpdateCard,
  replaceCard: IdNycFormField.applicationTypeReplaceCard,
};

/**
 * Fills Forms/IDNYCForm.pdf's AcroForm fields from a Profile. Any field
 * whose Profile value is missing is left blank rather than guessed.
 *
 * @param sourcePdfBytes bytes of the blank IDNYCForm.pdf.
 * @returns bytes of the filled PDF.
 */
export async function fillIdNycForm(
  sourcePdfBytes: Uint8Array | ArrayBuffer,
  profile: Profile,
  options: FillIdNycFormOptions = {},
): Promise<Uint8Array> {
  const { applicationType = 'new' } = options;

  const pdfDoc = await PDFDocument.load(sourcePdfBytes);
  const form = pdfDoc.getForm();

  const setText = (fieldId: string, value: string | undefined) => {
    if (!value) return;
    form.getTextField(fieldId).setText(value);
  };
  const setChecked = (fieldId: string, checked: boolean | undefined) => {
    if (!checked) return;
    form.getCheckBox(fieldId).check();
  };

  setChecked(applicationTypeField[applicationType], true);

  setText(IdNycFormField.firstName, profile.name.first);
  setText(IdNycFormField.middleName, profile.name.middle);
  setText(IdNycFormField.lastName, profile.name.last);

  const dob = parseIsoDate(profile.dateOfBirth);
  if (dob) {
    setText(IdNycFormField.dobMonth, dob.month);
    setText(IdNycFormField.dobDay, dob.day);
    setText(IdNycFormField.dobYear, dob.year);
  }

  if (profile.eyeColor) {
    form.getRadioGroup(IdNycFormField.eyeColor).select(EyeColorExportValue[profile.eyeColor]);
  }

  if (profile.heightInches != null) {
    const feet = Math.floor(profile.heightInches / 12);
    const inches = profile.heightInches % 12;
    setText(IdNycFormField.heightFeet, String(feet));
    setText(IdNycFormField.heightInches, String(inches));
  }

  if (profile.gender) {
    form.getRadioGroup(IdNycFormField.gender).select(GenderExportValue[profile.gender]);
  }

  setText(IdNycFormField.email, profile.email);

  const phone = splitPhone(profile.phone);
  if (phone) {
    setText(IdNycFormField.phoneAreaCode, phone.areaCode);
    setText(IdNycFormField.phonePrefix, phone.prefix);
    setText(IdNycFormField.phoneLine, phone.line);
  }

  setText(IdNycFormField.languagePreference, profile.languagePreference);
  setChecked(IdNycFormField.veteran, profile.isVeteran);
  setChecked(IdNycFormField.organDonor, profile.organDonorOptIn);

  setText(IdNycFormField.streetAddress, profile.address.street);
  setText(IdNycFormField.addressUnit, profile.address.unit);
  setText(IdNycFormField.city, profile.address.city);
  setText(IdNycFormField.zip, profile.address.zip);

  if (profile.address.borough) {
    form.getRadioGroup(IdNycFormField.borough).select(BoroughExportValue[profile.address.borough]);
  }

  if (profile.emergencyContact) {
    setText(IdNycFormField.emergencyContactName, profile.emergencyContact.name);
    const contactPhone = splitPhone(profile.emergencyContact.phone);
    if (contactPhone) {
      setText(IdNycFormField.emergencyContactPhoneAreaCode, contactPhone.areaCode);
      setText(IdNycFormField.emergencyContactPhonePrefix, contactPhone.prefix);
      setText(IdNycFormField.emergencyContactPhoneLine, contactPhone.line);
    }
  }

  return pdfDoc.save();
}

function parseIsoDate(iso: string): { month: string; day: string; year: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [, year, month, day] = match;
  return { month, day, year };
}

function splitPhone(
  digits: string | undefined,
): { areaCode: string; prefix: string; line: string } | null {
  if (!digits) return null;
  const cleaned = digits.replace(/\D/g, '');
  if (cleaned.length !== 10) return null;
  return {
    areaCode: cleaned.slice(0, 3),
    prefix: cleaned.slice(3, 6),
    line: cleaned.slice(6, 10),
  };
}
