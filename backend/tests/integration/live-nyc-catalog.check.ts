import { NycBenefitsCatalogProvider } from '@/features/benefits-discovery/providers/nyc-benefits-catalog.provider';

/** Manual/live check only; do not include in offline scenario runs. */
export async function checkLiveNycCatalog() {
  const programs =
    await new NycBenefitsCatalogProvider().getPrograms([
      'S2R007',
      'S2R019',
      'S2R013',
    ]);

  if (
    !programs.length ||
    programs.some(
      (program) =>
        !program.programId ||
        !program.programName ||
        program.source.type !== 'nyc_dataset'
    )
  ) {
    throw new Error(
      'Live NYC catalog normalization failed.'
    );
  }

  return {
    ok: true,
    count: programs.length,
    programs: programs.map((program) => ({
      programId: program.programId,
      programName: program.programName,
      source: program.source.type,
    })),
  };
}

checkLiveNycCatalog()
  .then((result) => {
    console.log(
      JSON.stringify(result, null, 2)
    );
  })
  .catch((error) => {
    console.error(
      'Live NYC catalog check failed:',
      error
    );

    process.exit(1);
  });