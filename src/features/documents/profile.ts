export type EyeColor =
  | 'brown'
  | 'hazel'
  | 'black'
  | 'blue'
  | 'green'
  | 'gray'
  | 'multiColor';

export type Gender = 'female' | 'male' | 'notDesignated';

export type Borough =
  | 'bronx'
  | 'brooklyn'
  | 'manhattan'
  | 'queens'
  | 'statenIsland';

/**
 * The user profile as owned by the Profile tab / document-extraction branch.
 * `name`/`dateOfBirth`/`address` overlap the design doc's prefill `form` state
 * (docs/design/README.md) and are expected to come from verified documents
 * (Photo ID, proof of address). Everything below `address` is not derivable
 * from any of the app's five document kinds and must be user-entered — the
 * IDNYC application asks for it, but nothing in Profile extracts it.
 */
export interface Profile {
  name: {
    first: string;
    middle?: string;
    last: string;
  };
  /** ISO 8601 date, e.g. '1991-04-18'. */
  dateOfBirth: string;
  address: {
    street: string;
    /** Apt / floor / suite / unit / room, combined. */
    unit?: string;
    city: string;
    zip: string;
    borough?: Borough;
  };

  eyeColor?: EyeColor;
  heightInches?: number;
  gender?: Gender;
  email?: string;
  /** Digits only, e.g. '7185550142'. */
  phone?: string;
  languagePreference?: string;
  isVeteran?: boolean;
  organDonorOptIn?: boolean;
  emergencyContact?: {
    name: string;
    /** Digits only. */
    phone: string;
  };
}

/**
 * The design doc's canonical demo person (docs/design/README.md, "Sample
 * extracted values"), extended with the IDNYC-only fields above so the form
 * filler has something realistic to exercise end to end.
 */
export const mockProfile: Profile = {
  name: { first: 'Maria', last: 'Reyes' },
  dateOfBirth: '1991-04-18',
  address: {
    street: '1240 Grand Concourse',
    city: 'Bronx',
    zip: '10456',
    borough: 'bronx',
  },
  eyeColor: 'brown',
  heightInches: 64,
  gender: 'female',
  email: 'maria.reyes@example.com',
  phone: '7185550142',
  languagePreference: 'Spanish',
  isVeteran: false,
  organDonorOptIn: true,
  emergencyContact: {
    name: 'Carlos Reyes',
    phone: '7185550198',
  },
};
