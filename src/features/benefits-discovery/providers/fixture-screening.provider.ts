import type { BenefitsScreeningProvider } from '../adapters/benefits-screening-provider';
import type { BenefitsScreeningInput, ScreeningResult } from '../types';

const FIXTURE_MATCHES = [
  { programCode: 'S2R007', programName: 'Supplemental Nutrition Assistance Program' },
  { programCode: 'S2R019', programName: 'Home Energy Assistance Program' },
  { programCode: 'S2R013', programName: 'Section 8 / Housing Choice Voucher Program' },
  { programCode: 'FIXTURE_FAIR_FARES', programName: 'Fair Fares NYC' },
  { programCode: 'FIXTURE_IDNYC', programName: 'IDNYC' },
  { programCode: 'FIXTURE_NYC_CARE', programName: 'NYC Care' },
];

/** Development-only stand-in for an authenticated NYC Screening API account. */
export class FixtureScreeningProvider implements BenefitsScreeningProvider {
  async screen(input: BenefitsScreeningInput): Promise<ScreeningResult> {
    if (input.nycResident === false) return { matches: [], sourceType: 'fixture' };
    return {
      matches: FIXTURE_MATCHES.map((match) => ({ ...match, needsMoreInformation: input.nycResident === undefined })),
      sourceType: 'fixture',
    };
  }
}
