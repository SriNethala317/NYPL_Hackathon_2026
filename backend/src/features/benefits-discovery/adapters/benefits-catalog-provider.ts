import type { BenefitProgram } from '../types';

export interface BenefitsCatalogProvider {
  getPrograms(programCodes?: string[]): Promise<BenefitProgram[]>;
}
