/**
 * Field map for Forms/IDNYCForm.pdf, page 1 (the only page with an AcroForm).
 * The PDF's field names are bare numbers ('1'..'32') with no semantic
 * labels, so this map was built by inspecting each widget's rect against the
 * surrounding page text (pymupdf) and each button field's export states
 * (pypdf `get_fields()[name]['/_States_']`). Re-derive it if IDNYCForm.pdf is
 * ever replaced with a different revision of the form.
 */
export const IdNycFormField = {
  idnycNumber: '1', // existing card number, renewals only

  applicationTypeNew: '2',
  applicationTypeReapplication: '3',
  applicationTypeRenewal: '4',
  applicationTypeUpdateCard: '5',
  applicationTypeReplaceCard: '6',

  firstName: '7',
  middleName: '8',
  lastName: '9',
  dobMonth: '10',
  dobDay: '11',
  dobYear: '12',

  eyeColor: '13', // radio group, see EyeColorExportValue

  heightFeet: '14',
  heightInches: '15',

  gender: '16', // radio group, see GenderExportValue

  email: '17',
  phoneAreaCode: '18',
  phonePrefix: '19',
  phoneLine: '20',

  languagePreference: '21',
  veteran: '22', // checkbox
  organDonor: '23', // checkbox: opt in to the Donate Life Registry

  streetAddress: '24',
  addressUnit: '25', // apt / fl / ste / unit / rm
  city: '26',
  zip: '27', // state is preprinted as NY, not a field

  borough: '28', // radio group, see BoroughExportValue

  emergencyContactName: '29',
  emergencyContactPhoneAreaCode: '30',
  emergencyContactPhonePrefix: '31',
  emergencyContactPhoneLine: '32',
} as const;

export const EyeColorExportValue = {
  brown: '13a',
  hazel: '13b',
  black: '13c',
  blue: '13d',
  green: '13e',
  gray: '13f',
  multiColor: '13g',
} as const;

export const GenderExportValue = {
  female: '16a',
  male: '16b',
  notDesignated: '16c',
} as const;

export const BoroughExportValue = {
  bronx: '28a',
  brooklyn: '28b',
  manhattan: '28c',
  queens: '28d',
  statenIsland: 'Choice1',
} as const;
