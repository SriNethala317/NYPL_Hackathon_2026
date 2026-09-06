import { supabaseSelect } from '@/db/supabase-client';
import criteriaFile from '@/data/program-criteria.generated.json';
import catalogueFile from '@/data/programs.generated.json';
import type { DocumentCategory, Program, ProgramCriteria, ProgramCriteriaRecord } from './json-catalogue';

/**
 * The Postgres-backed catalogue implementation — behind `FEATURE_FLAGS.databaseBackedCatalogue`
 * (default off; see `generic-catalogue.ts`, the dispatcher this sits behind). Same exported
 * interface as `json-catalogue.ts`, so `generic-evaluator.ts`/`eligibility-engine.ts` need no
 * changes at all to use either one.
 *
 * IMPORTANT — this is a genuine but partial database integration, not a full one, and that's a
 * property of the schema, not a shortcut taken here. `benefit_programs`, `income_eligibility` (+
 * `income_eligibility_thresholds`), `basic_eligibility_filters`, and `eligibility_rules` hold real
 * columns for: the program's `name`, NYC-residency (`requires_nyc_residency`), `min_age`/`max_age`
 * (`eligibility_rules`), and the income brackets/caps (`income_eligibility` + thresholds). Those
 * five are queried from Postgres for real, below.
 *
 * They do NOT hold columns for `partial`, `unchecked`, `sources` (the quoted citation text), or
 * `renewal` — confirmed absent from the schema across three separate sessions
 * (`database/generic_eligibility_engine_scoping.md`,
 * `database/validation_and_gemini_alignment_audit.md`) — nor for `requiredCategories` or most
 * `Program` display fields (`agency`, `eligibilityText`, `applyUrl`, `sourceUrl`, ...); only
 * `name` lives on `benefit_programs` itself. This is "Option B" from the scoping doc: those fields
 * are read from the same generated JSON files `json-catalogue.ts` uses, keyed by the same
 * normalized program id. This is deliberate, not an oversight — `partial`/`unchecked` are the
 * exact mechanism that stops a collapsed OR-condition from producing a wrong hard denial (see
 * `ProgramCriteriaRecord.partial`'s doc in `json-catalogue.ts`), so guessing a value for them from
 * nothing would silently reintroduce that bug for every program using this path. Reading them from
 * the same JSON file both implementations already share is what makes exact output parity between
 * the two paths achievable at all — see this feature's session report for the real, verified
 * comparison.
 *
 * A real consequence: this path is not a way to stop relying on the generated JSON files. It
 * proves out Postgres as the source for the fields the schema actually models, while the rest
 * stays exactly as accurate (or as limited) as `json-catalogue.ts` already is.
 */

type BenefitProgramRow = { id: string; code: string; name: string; active: boolean };
type IncomeEligibilityRow = {
  benefit_program_id: string;
  type: 'by_household_size' | 'flat_limit' | 'not_income_based';
  flat_annual_limit: number | null;
  additional_person_annual_increment: number | null;
  income_eligibility_thresholds: { household_size: number; annual_income_limit: number }[];
};
type BasicEligibilityFilterRow = { benefit_program_id: string; requires_nyc_residency: boolean };
type EligibilityRuleRow = { benefit_program_id: string; rule_key: 'min_age' | 'max_age'; rule_value: string };

type GeneratedCriteriaRecord = ProgramCriteriaRecord;
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

const normalizeProgramId = (id: string): string => id.toLowerCase();

// The fields the schema has no columns for at all — sourced from the same generated JSON both
// catalogue implementations already ship with. See the module comment above for why.
const jsonCriteriaByCode = new Map<string, GeneratedCriteriaRecord>(
  (criteriaFile as { programs: GeneratedCriteriaRecord[] }).programs.map((record) => [
    normalizeProgramId(record.programId),
    record,
  ]),
);
const jsonProgramByCode = new Map<string, GeneratedProgram>(
  (catalogueFile as { programs: GeneratedProgram[] }).programs.map((p) => [normalizeProgramId(p.id), p]),
);

export const programs: Program[] = [];
const criteriaById = new Map<string, ProgramCriteriaRecord>();
let initialized = false;
let loadPromise: Promise<void> | null = null;

/**
 * Loads the whole catalogue from Postgres once and caches it in memory. `programById`/
 * `criteriaFor`/`scorablePrograms` below stay synchronous (matching `json-catalogue.ts`'s
 * interface, which `generic-evaluator.ts` depends on) by reading this cache — the async work
 * happens once, up front, awaited by `generic-catalogue.ts`'s `initialize()` before the server
 * starts accepting requests, not per lookup.
 */
async function loadFromDatabase(): Promise<void> {
  const [programRows, incomeRows, filterRows, ruleRows] = await Promise.all([
    supabaseSelect<BenefitProgramRow>('benefit_programs', 'select=id,code,name,active&active=eq.true'),
    supabaseSelect<IncomeEligibilityRow>(
      'income_eligibility',
      'select=benefit_program_id,type,flat_annual_limit,additional_person_annual_increment,income_eligibility_thresholds(household_size,annual_income_limit)',
    ),
    supabaseSelect<BasicEligibilityFilterRow>('basic_eligibility_filters', 'select=benefit_program_id,requires_nyc_residency'),
    supabaseSelect<EligibilityRuleRow>('eligibility_rules', 'select=benefit_program_id,rule_key,rule_value&rule_key=in.(min_age,max_age)'),
  ]);

  const incomeByProgram = new Map(incomeRows.map((row) => [row.benefit_program_id, row]));
  const filterByProgram = new Map(filterRows.map((row) => [row.benefit_program_id, row]));
  const rulesByProgram = new Map<string, EligibilityRuleRow[]>();
  for (const rule of ruleRows) {
    const list = rulesByProgram.get(rule.benefit_program_id) ?? [];
    list.push(rule);
    rulesByProgram.set(rule.benefit_program_id, list);
  }

  const nextPrograms: Program[] = [];
  const nextCriteriaById = new Map<string, ProgramCriteriaRecord>();

  for (const row of programRows) {
    const normalizedId = normalizeProgramId(row.code);
    const jsonProgram = jsonProgramByCode.get(normalizedId);
    const jsonRecord = jsonCriteriaByCode.get(normalizedId);

    nextPrograms.push({
      id: row.code,
      // Real DB column. Everything else here has no column on benefit_programs at all — read
      // from the matching generated-JSON program record instead (see module comment).
      name: row.name,
      programCode: jsonProgram?.programCode,
      acronym: jsonProgram?.acronym,
      plainLanguageName: jsonProgram?.plainLanguageName,
      category: jsonProgram?.category,
      agency: jsonProgram?.agency,
      populationServed: jsonProgram?.populationServed ?? [],
      summary: jsonProgram?.summary,
      eligibilityText: jsonProgram?.eligibilityText,
      requiredDocumentsText: jsonProgram?.requiredDocumentsText,
      applyUrl: jsonProgram?.applyUrls?.online,
      sourceUrl: jsonProgram?.source?.url ?? 'https://data.cityofnewyork.us/d/kvhd-5fmu',
    });

    const criteria: ProgramCriteria = {};

    const filter = filterByProgram.get(row.id);
    // Mirrors the JSON source's own shape exactly: a key present and `true`, or absent — never an
    // explicit `false` — because the heuristic that produced this column only ever detects a
    // *positive* residency mention (see push-catalogue.mjs). `evaluate()` only ever checks this
    // value when truthy, so this also matches its behavior either way.
    if (filter?.requires_nyc_residency === true) criteria.nycResident = true;

    for (const rule of rulesByProgram.get(row.id) ?? []) {
      const value = Number(rule.rule_value);
      if (!Number.isFinite(value)) continue;
      if (rule.rule_key === 'min_age') criteria.minAge = value;
      else criteria.maxAge = value;
    }

    const income = incomeByProgram.get(row.id);
    if (income?.type === 'by_household_size') {
      const table: Record<string, number> = {};
      for (const threshold of income.income_eligibility_thresholds) {
        table[String(threshold.household_size)] = threshold.annual_income_limit;
      }
      if (Object.keys(table).length > 0) criteria.annualIncomeByHouseholdSize = table;
      if (income.additional_person_annual_increment !== null) {
        criteria.additionalPersonIncrement = income.additional_person_annual_increment;
      }
    } else if (income?.type === 'flat_limit' && income.flat_annual_limit !== null) {
      criteria.annualIncomeCap = income.flat_annual_limit;
    }

    // requiredCategories has no column anywhere in the schema — read from the same JSON record.
    if (jsonRecord?.criteria.requiredCategories) {
      criteria.requiredCategories = jsonRecord.criteria.requiredCategories as DocumentCategory[];
    }

    // The exact formula derive-criteria.mjs uses to compute this from the same five fields, now
    // reconstructed from Postgres instead of read pre-computed from JSON.
    const scorable = Boolean(
      criteria.nycResident ||
        criteria.minAge !== undefined ||
        criteria.maxAge !== undefined ||
        criteria.annualIncomeByHouseholdSize ||
        criteria.annualIncomeCap,
    );

    nextCriteriaById.set(normalizedId, {
      programId: row.code,
      programName: row.name,
      scorable,
      method: 'heuristic',
      // No column anywhere for these three — see module comment. Read from the same JSON record
      // `json-catalogue.ts` uses, so both paths agree on them by construction, not by luck.
      partial: jsonRecord?.partial,
      unchecked: jsonRecord?.unchecked,
      sources: jsonRecord?.sources ?? {},
      renewal: jsonRecord?.renewal,
      sourceUrl: jsonRecord?.sourceUrl,
      criteria,
    });
  }

  programs.length = 0;
  programs.push(...nextPrograms);
  criteriaById.clear();
  for (const [key, value] of nextCriteriaById) criteriaById.set(key, value);
}

/** Runs the load exactly once, even if called concurrently (e.g. by more than one request racing
 * on a cold cache). Safe to call repeatedly — later calls resolve once the first load finishes. */
export async function initialize(): Promise<void> {
  if (initialized) return;
  loadPromise ??= loadFromDatabase().then(() => {
    initialized = true;
  });
  return loadPromise;
}

/**
 * Fails loudly rather than silently returning an empty catalogue. Confirmed by actually hitting
 * this: running `npm test` with `DATABASE_BACKED_CATALOGUE=true` but no explicit
 * `initializeCatalogue()` call (as `tests/run-scenarios.ts` doesn't) previously failed with a
 * confusing "Eligibility scenario failed for fair_fares" — a downstream symptom of an empty cache,
 * not a clear signal of the real cause. Any real entry point (`server.ts`) already awaits
 * `initializeCatalogue()` before accepting requests; a script or test that enables this flag needs
 * to do the same.
 */
function assertInitialized(): void {
  if (!initialized) {
    throw new Error(
      'postgres-catalogue: initialize() must be awaited before use (e.g. at server startup, same as server.ts does) — the Postgres-backed catalogue has not been loaded yet.',
    );
  }
}

export function programById(id: string): Program | undefined {
  assertInitialized();
  const target = normalizeProgramId(id);
  return programs.find((program) => normalizeProgramId(program.id) === target);
}

export function criteriaFor(id: string): ProgramCriteriaRecord | undefined {
  assertInitialized();
  return criteriaById.get(normalizeProgramId(id));
}

export function scorablePrograms(): Program[] {
  assertInitialized();
  return programs.filter((program) => criteriaById.get(normalizeProgramId(program.id))?.scorable);
}
