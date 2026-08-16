import { NycBenefitsCatalogProvider } from '@/features/benefits-discovery/providers/nyc-benefits-catalog.provider';

/** Manual/live check only; do not include in offline scenario runs. */
export async function checkLiveNycCatalog(): Promise<void> {
  const programs = await new NycBenefitsCatalogProvider().getPrograms(['S2R007', 'S2R019', 'S2R013']);
  if (!programs.length || programs.some((program) => !program.programId || !program.programName || program.source.type !== 'nyc_dataset')) throw new Error('Live NYC catalog normalization failed.');
}
