import criteriaFile from '@/data/program-criteria.generated.json';
import catalogueFile from '@/data/programs.generated.json';

/**
 * The JSON-backed catalogue implementation — one of two behind `generic-catalogue.ts`'s
 * `DATABASE_BACKED_CATALOGUE` flag (see `postgres-catalogue.ts` for the other). This one is the
 * original, always-available implementation and stays the default; it is also `postgres-catalogue.ts`'s
 * own source for the fields the database schema has no columns for at all (`partial`, `unchecked`,
 * `sources`, `renewal`, `requiredCategories`, and most `Program` display fields) — see that file's
 * module comment for why.
 *
 * Ported from `src/data/catalogue.ts` (the Expo app). That module is not importable here as-is —
 * it pulls a real (non-type) value from `@/theme`, which drags in React Native and cannot run
 * outside Expo (confirmed in an earlier session: `import { documentCategories } from '@/theme'`
 * transform-fails under plain Node/tsx). `DocumentCategory` itself has no React dependency at all
 * — it is a 5-value string union — so it is copied inline below rather than re-exported from a
 * module that can't load.
 *
 * `programs.generated.json` (the full, untrimmed record) is copied here rather than
 * `programs.runtime.json` (the trimmed bundle the Expo app ships) because the generic engine
 * needs display/citation fields — `agency`, `eligibilityText`, `requiredDocumentsText`,
 * `applyUrls`, `source.url` — that `programs.runtime.json` already carries but that
 * `benefit_programs` has no columns for (confirmed in
 * `database/generic_eligibility_engine_scoping.md`). Both JSON files are copies of generated
 * output, not hand-edited; re-copy them if `ingest-programs.mjs`/`derive-criteria.mjs` are re-run
 * against a fresher catalogue.
 */

export type DocumentCategory = 'identity' | 'immigration' | 'income' | 'residence' | 'other';

export type Program = {
  /** `unique_id_number` from the dataset. */
  id: string;
  /** The City's program code, where it has one. Used to match against the NYC Screening API. */
  programCode?: string;
  name: string;
  acronym?: string;
  plainLanguageName?: string;
  category?: string;
  agency?: string;
  populationServed: string[];
  summary?: string;
  eligibilityText?: string;
  requiredDocumentsText?: string;
  applyUrl?: string;
  sourceUrl: string;
};

export type ProgramCriteria = {
  nycResident?: boolean;
  minAge?: number;
  maxAge?: number;
  /** Income cap keyed by household size, as published. */
  annualIncomeByHouseholdSize?: Record<string, number>;
  /** Added per person beyond the largest published bracket. */
  additionalPersonIncrement?: number;
  /** A single cap where the program publishes no bracket table. */
  annualIncomeCap?: number;
  requiredCategories?: DocumentCategory[];
};

export type ProgramRenewal = {
  cadenceMonths: number;
  deadlineMonth?: number;
  deadlineDay?: number;
  sourceText?: string;
};

export type ProgramCriteriaRecord = {
  programId: string;
  programName: string;
  /** False means the rules exist only as prose that couldn't be parsed — browsable, never scored. */
  scorable: boolean;
  method: 'heuristic' | 'llm' | 'unmatched';
  /**
   * The parsed rule is a fragment of the real test — the program offers alternative routes to
   * eligibility, or turns on something never asked about. A fragment can support "you may
   * qualify"; it can never support "you may not". This is the exact mechanism that prevents a
   * collapsed OR-condition from producing a wrong hard denial (the documented case: a program
   * whose real test was "65 or older, OR legally blind, OR deaf, ..." collapsing to a hard age-65
   * floor and telling a forty-year-old blind rider they didn't qualify). Preserved unchanged from
   * the source — do not drop or approximate this field.
   */
  partial?: boolean;
  unchecked?: string[];
  criteria: ProgramCriteria;
  renewal?: ProgramRenewal;
  /** The City's own sentence behind each criterion, quotable to the applicant. */
  sources: Partial<Record<'nycResident' | 'age' | 'income', string>>;
  sourceUrl?: string;
};

type GeneratedProgram = {
  id: string;
  programCode?: string;
  name: string;
  acronym?: string;
  plainLanguageName?: string;
  category?: string;
  agency?: string;
  populationServed?: string[];
  summary?: string;
  eligibilityText?: string;
  requiredDocumentsText?: string;
  applyUrls?: { online?: string; inPerson?: string };
  source?: { url?: string };
};

const catalogue = catalogueFile as { fetchedAt: string; programs: GeneratedProgram[] };
const criteria = criteriaFile as { programs: ProgramCriteriaRecord[] };

export const catalogueFetchedAt: string = catalogue.fetchedAt;

export const programs: Program[] = catalogue.programs.map((p) => ({
  id: p.id,
  programCode: p.programCode,
  name: p.name,
  acronym: p.acronym,
  plainLanguageName: p.plainLanguageName,
  category: p.category,
  agency: p.agency,
  populationServed: p.populationServed ?? [],
  summary: p.summary,
  eligibilityText: p.eligibilityText,
  requiredDocumentsText: p.requiredDocumentsText,
  applyUrl: p.applyUrls?.online,
  sourceUrl: p.source?.url ?? 'https://data.cityofnewyork.us/d/kvhd-5fmu',
}));

/**
 * `benefit_programs.code` (Supabase) is seeded lowercased to match the live NYC catalog
 * provider's own lowercased `programId` (see `scripts/push-catalogue.mjs` and
 * `program-id-resolver.ts`). This catalogue's own ids stay in their original mixed case
 * ("P120en"). Normalizing at every lookup — same approach as `src/data/catalogue.ts` — is what
 * lets a lowercase id read back from the database resolve to the same program.
 */
const normalizeProgramId = (id: string): string => id.toLowerCase();

const criteriaById = new Map<string, ProgramCriteriaRecord>(
  criteria.programs.map((record) => [normalizeProgramId(record.programId), record]),
);

/** No loading step needed — the JSON files are read at import time. Present so the dispatcher in
 * `generic-catalogue.ts` can `await initialize()` the same way regardless of which
 * implementation is active. */
export async function initialize(): Promise<void> {}

export function programById(id: string): Program | undefined {
  const target = normalizeProgramId(id);
  return programs.find((program) => normalizeProgramId(program.id) === target);
}

export function criteriaFor(id: string): ProgramCriteriaRecord | undefined {
  return criteriaById.get(normalizeProgramId(id));
}

/** Programs the generic engine can actually score, which is a subset of the catalogue. */
export function scorablePrograms(): Program[] {
  return programs.filter((program) => criteriaById.get(normalizeProgramId(program.id))?.scorable);
}

/**
 * The income ceiling for a given household size. Ported unchanged from `src/data/catalogue.ts`.
 *
 * Beyond the largest published bracket the agency states a per-person increment; applying it is
 * what the agency itself instructs, so a household of 12 is not silently treated as a household
 * of 8.
 */
export function incomeLimitFor(criteriaRecord: ProgramCriteria, householdSize: number): number | undefined {
  if (criteriaRecord.annualIncomeCap !== undefined) return criteriaRecord.annualIncomeCap;

  const table = criteriaRecord.annualIncomeByHouseholdSize;
  if (!table) return undefined;

  const size = Math.max(1, Math.trunc(householdSize) || 1);
  const direct = table[String(size)];
  if (direct !== undefined) return direct;

  const sizes = Object.keys(table).map(Number).sort((a, b) => a - b);
  const largest = sizes[sizes.length - 1];
  if (size <= largest) return table[String(largest)];

  const increment = criteriaRecord.additionalPersonIncrement;
  if (increment === undefined) return table[String(largest)];
  return table[String(largest)] + (size - largest) * increment;
}
