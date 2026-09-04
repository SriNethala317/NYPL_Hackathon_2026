/**
 * Reconciles the two `programId` schemes this app has for the same 3 programs.
 *
 * The live NYC catalog (`NycBenefitsCatalogProvider`) derives its own `programId` at request
 * time from the dataset's `unique_id_number` (lowercased, e.g. "p032en" for IDNYC — confirmed
 * against `src/data/programs.generated.json`'s raw `"P032en"`). The eligibility validators, the
 * route guards, and the form-payload mappings were all written earlier against a separate,
 * fixture-era literal scheme (`"idnyc"`, `"fair_fares"`, `"nyc_care"`). `LIVE_BENEFITS_CATALOG`
 * defaults to `true`, so the live scheme is what a real client actually receives from
 * `/discover` — this table is the one place that maps it back to the literal scheme everything
 * downstream still expects.
 *
 * NYC Care has no `program_code` in the live dataset (checked — the field is simply absent for
 * that row), so its alias list is one entry shorter than IDNYC's and Fair Fares's.
 */
const PROGRAM_ID_ALIASES: Record<string, string[]> = {
  idnyc: ['idnyc', 'p032en', 's2r032'],
  fair_fares: ['fair_fares', 'p120en', 's2r034', 'fair fares nyc'],
  nyc_care: ['nyc_care', 'p107en', 'nyc care'],
};

const REVERSE_LOOKUP = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(PROGRAM_ID_ALIASES)) {
  for (const alias of aliases) REVERSE_LOOKUP.set(alias.toLowerCase(), canonical);
}

/**
 * Resolves any known id/code/name variant (case-insensitive) to the canonical literal id used
 * by the eligibility validators and form mappings — `undefined` if it isn't a recognized alias
 * of a supported program. This does not accept arbitrary ids; an unrecognized value stays
 * unrecognized.
 */
export function resolveCanonicalProgramId(candidate: string | undefined | null): string | undefined {
  if (!candidate) return undefined;
  return REVERSE_LOOKUP.get(candidate.trim().toLowerCase());
}

/**
 * Same resolution, tried against every identifying field a catalog program carries — id, then
 * code, then name — so discovery's own "does this program support detailed validation" check
 * and the route guards downstream share exactly one definition of which variant means which
 * program, instead of two that can drift apart again.
 */
export function resolveCanonicalProgramIdForProgram(program: {
  programId: string;
  programCode?: string;
  programName?: string;
}): string | undefined {
  return (
    resolveCanonicalProgramId(program.programId) ??
    resolveCanonicalProgramId(program.programCode) ??
    resolveCanonicalProgramId(program.programName)
  );
}
