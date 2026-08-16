import type { BenefitsCatalogProvider } from '../adapters/benefits-catalog-provider';
import type { BenefitProgram } from '../types';

export const FIXTURE_BENEFIT_PROGRAMS: BenefitProgram[] = [
  { programId: 'snap', programCode: 'S2R007', programName: 'Supplemental Nutrition Assistance Program', category: 'Food', description: 'Monthly benefits to help buy groceries.', officialSourceUrl: 'https://access.nyc.gov/programs/snap/', source: { type: 'fixture', lastVerified: '2026-08-15' } },
  { programId: 'heap', programCode: 'S2R019', programName: 'Home Energy Assistance Program', category: 'Cash & expenses', description: 'Help with home energy costs.', officialSourceUrl: 'https://access.nyc.gov/programs/heap/', source: { type: 'fixture', lastVerified: '2026-08-15' } },
  { programId: 'section_8', programCode: 'S2R013', programName: 'Section 8 / Housing Choice Voucher Program', category: 'Housing', description: 'Rental assistance for eligible households.', officialSourceUrl: 'https://access.nyc.gov/programs/section-8-housing-choice-voucher-program/', source: { type: 'fixture', lastVerified: '2026-08-15' } },
  { programId: 'fair_fares', programCode: 'FIXTURE_FAIR_FARES', programName: 'Fair Fares NYC', category: 'Cash & expenses', description: 'Half-price public transportation fares for eligible New Yorkers.', officialSourceUrl: 'https://www.nyc.gov/site/fairfares/', source: { type: 'fixture', lastVerified: '2026-08-15' } },
  { programId: 'idnyc', programCode: 'FIXTURE_IDNYC', programName: 'IDNYC', category: 'City ID Card', description: 'Free municipal identification card for New York City residents.', officialSourceUrl: 'https://www.nyc.gov/site/idnyc/about/about.page', source: { type: 'fixture', lastVerified: '2026-08-15' } },
  { programId: 'nyc_care', programCode: 'FIXTURE_NYC_CARE', programName: 'NYC Care', category: 'Health', description: 'Low- and no-cost care through NYC Health + Hospitals.', officialSourceUrl: 'https://www.nyccare.nyc/about/', source: { type: 'fixture', lastVerified: '2026-08-15' } },
];

export class FixtureCatalogProvider implements BenefitsCatalogProvider {
  async getPrograms(programCodes?: string[]): Promise<BenefitProgram[]> {
    if (!programCodes?.length) return FIXTURE_BENEFIT_PROGRAMS;
    const requested = new Set(programCodes);
    return FIXTURE_BENEFIT_PROGRAMS.filter((program) => program.programCode && requested.has(program.programCode));
  }
}
