#!/usr/bin/env node
/**
 * Pushes the ingested NYC catalogue into Supabase.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/push-catalogue.mjs
 *
 * Run after `ingest-programs.mjs` and `derive-criteria.mjs`, and after applying
 * `supabase/migrations/20260101000001_base_schema.sql` (plus the follow-on migrations).
 *
 * This is the one place the service-role key is used, and it is a local script — never the app.
 * That key bypasses every row-level policy, so putting it in a bundle would make the whole RLS
 * design decorative. It is read from the environment and never written to disk.
 *
 * ---------------------------------------------------------------------------------------------
 * Rewritten against the redesigned schema (`database/schema.sql` + the `20260101000002..000004`
 * migrations). The pre-redesign `programs`/`program_criteria` tables this used to target are gone;
 * the real catalogue-bearing tables now are `benefit_programs`, `income_eligibility` (+
 * `income_eligibility_thresholds`), `basic_eligibility_filters`, and `eligibility_rules`.
 *
 * `benefit_programs.code` holds the catalogue's own `id` (e.g. "P085en"), NOT the NYC Screening
 * API's `programCode` (e.g. "S2R085"). Confirmed by grepping every real caller of `programId`
 * (`programById`, `criteriaFor`, `templateFor`, `evaluate`, `renewalWindowFor`,
 * `profile-repository.ts`'s existing `benefit_programs(code)` join) — every one of them means the
 * catalogue's `id`. `programCode` is used for exactly one thing (matching NYC's own Screening API
 * responses) and has no column on `benefit_programs` — there was never a reason to add one, since
 * nothing in this app calls that API against this table yet.
 *
 * Not every field `criteriaFor()` returns has a home in the current schema. What's seeded, and
 * what's a real gap left for a human decision rather than forced into a table that doesn't fit:
 *
 *   - `criteria.nycResident`, `.annualIncomeByHouseholdSize`, `.additionalPersonIncrement`,
 *     `.annualIncomeCap`               -> income_eligibility / income_eligibility_thresholds,
 *                                          basic_eligibility_filters.has_income_test
 *   - `criteria.minAge` / `.maxAge`    -> eligibility_rules (rule_key `min_age`/`max_age` — the
 *                                          schema's own column comment names `min_age` as an
 *                                          example, so this is the table's intended use, not a
 *                                          guess). No unique constraint exists on
 *                                          (benefit_program_id, rule_key), so this script keeps
 *                                          idempotency by deleting a program's rows before
 *                                          re-inserting them, rather than upserting.
 *   - Program.populationServed containing "Students" -> basic_eligibility_filters.targets_students
 *   - `criteria.requiredCategories`   -> NO COLUMN ANYWHERE. `benefit_programs` carries no
 *                                          required-documents field at all in the redesigned
 *                                          schema (the old `programs` table's richer shape —
 *                                          `plain_language_eligibility`, `population_served`,
 *                                          `summary`, required-document categories — was never
 *                                          ported). Not seeded. Flag for a human: either add the
 *                                          column(s) back or decide documents are derived some
 *                                          other way.
 *   - `scorable`, `method`, `partial`, `unchecked`, `sources.*` (the quoted `sourceText` per
 *     criterion), `renewal.*`         -> NO TABLE ANYWHERE. These describe the derivation itself
 *                                          (confidence, quoted provenance, renewal cadence) —
 *                                          there's no renewal table, no per-criterion source-quote
 *                                          table, and no scorable/method/partial/unchecked columns
 *                                          on any table. `eligibility_rules` is a flat
 *                                          key/value table (rule_key/rule_value, both scalar
 *                                          strings) and cannot hold `sources` (one quote per
 *                                          criterion) or `renewal` (3 sub-fields) without losing
 *                                          structure. Not seeded. This is a genuine schema gap,
 *                                          not something to force into `eligibility_rules`.
 *   - the categorical `age_group` list (e.g. "Baby", "Toddler", "Older Adults") that
 *     `basic_eligibility_filter_age_groups` expects -> NOT AVAILABLE from `catalogue.ts`'s data
 *                                          at all. It's parsed from the City's `age_group` column
 *                                          in `programs.generated.json` (the untrimmed record),
 *                                          but `ingest-programs.mjs` drops it from
 *                                          `programs.runtime.json` — the file `catalogue.ts`
 *                                          actually imports — as an unrendered field. Not seeded.
 *                                          Reaching into `programs.generated.json` here would
 *                                          reintroduce a field the app deliberately doesn't carry;
 *                                          that's a call for a human, not this script.
 *   - `immigration_requirement`        -> deliberately left at its schema default
 *                                          (`NOT_SPECIFIED`). Its own column comment requires a
 *                                          human reading each program's actual eligibility text —
 *                                          "never inferred ... alone" — so a heuristic script must
 *                                          not set it.
 *
 * The catalogue is public data: these tables are world-readable and have no insert policy, so
 * only this script (service role) can write them.
 * ---------------------------------------------------------------------------------------------
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Find both in your project under Settings → API. Do not commit them.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const data = join(here, '..', 'src', 'data');

const catalogue = JSON.parse(await readFile(join(data, 'programs.runtime.json'), 'utf8'));
const criteria = JSON.parse(await readFile(join(data, 'program-criteria.generated.json'), 'utf8'));
const criteriaById = new Map(criteria.programs.map((c) => [c.programId, c]));

const fetchedAtDate = catalogue.fetchedAt.slice(0, 10);

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

async function request(method, path, body, extraHeaders = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: { ...headers, ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${method} ${path}: ${response.status} ${response.statusText}\n${await response.text()}`);
  }
  // Without `Prefer: return=representation`, PostgREST answers 200/201/204 with an empty body.
  const text = await response.text();
  return text.length === 0 ? null : JSON.parse(text);
}

/** Upsert on a real unique constraint, returning the written rows (so callers get generated ids back). */
async function upsert(table, rows, conflictColumn) {
  if (rows.length === 0) return [];
  return request('POST', `${table}?on_conflict=${conflictColumn}`, rows, {
    Prefer: 'resolution=merge-duplicates,return=representation',
  });
}

// 1. benefit_programs — code = catalogue id (see header comment for why).
const programRows = catalogue.programs.map((p) => ({
  code: p.id,
  name: p.name,
  description: p.summary ?? null,
  active: true,
}));
const writtenPrograms = await upsert('benefit_programs', programRows, 'code');
const benefitProgramIdByCode = new Map(writtenPrograms.map((row) => [row.code, row.id]));
console.log(`pushed ${writtenPrograms.length} benefit_programs`);

// 2. income_eligibility (+ thresholds) and basic_eligibility_filters — one pass per program.
const incomeRows = [];
const noLongerIncomeTested = [];
const filterRows = [];
for (const program of catalogue.programs) {
  const benefitProgramId = benefitProgramIdByCode.get(program.id);
  const record = criteriaById.get(program.id);
  const c = record?.criteria ?? {};

  const hasTable = Boolean(c.annualIncomeByHouseholdSize);
  const hasFlatCap = !hasTable && c.annualIncomeCap !== undefined;

  if (hasTable) {
    incomeRows.push({
      benefit_program_id: benefitProgramId,
      type: 'by_household_size',
      // Set explicitly (not omitted) so a program that flips from flat_limit to
      // by_household_size on a re-derivation doesn't keep a stale flat_annual_limit — PostgREST's
      // merge-duplicates only updates the columns present in the payload.
      flat_annual_limit: null,
      additional_person_annual_increment: c.additionalPersonIncrement ?? null,
    });
  } else if (hasFlatCap) {
    incomeRows.push({
      benefit_program_id: benefitProgramId,
      type: 'flat_limit',
      flat_annual_limit: c.annualIncomeCap,
      additional_person_annual_increment: null,
    });
  } else {
    // No income criterion detected this run. If a previous run wrote one, remove it (cascades to
    // its thresholds) — upsert alone can't turn a row absent, only update one that's present.
    noLongerIncomeTested.push(benefitProgramId);
  }

  filterRows.push({
    benefit_program_id: benefitProgramId,
    has_income_test: hasTable || hasFlatCap,
    targets_students: program.populationServed.some((p) => /student/i.test(p)),
    // requires_nyc_residency and immigration_requirement are left at their schema defaults —
    // see header comment. We only ever detect a *positive* NYC-residency mention, never a
    // negative one, so writing anything but the default would be inventing evidence.
    last_computed_at: new Date().toISOString(),
  });
}

if (noLongerIncomeTested.length > 0) {
  await request('DELETE', `income_eligibility?benefit_program_id=in.(${noLongerIncomeTested.join(',')})`);
}
const writtenIncome = await upsert('income_eligibility', incomeRows, 'benefit_program_id');
console.log(`pushed ${writtenIncome.length} income_eligibility rows`);

const householdIncomeRows = writtenIncome.filter((row) => row.type === 'by_household_size');
const thresholdRows = [];
for (const row of householdIncomeRows) {
  const program = catalogue.programs.find((p) => benefitProgramIdByCode.get(p.id) === row.benefit_program_id);
  const table = criteriaById.get(program.id)?.criteria.annualIncomeByHouseholdSize ?? {};
  for (const [size, limit] of Object.entries(table)) {
    thresholdRows.push({
      income_eligibility_id: row.id,
      household_size: Number(size),
      annual_income_limit: limit,
    });
  }
}
// A bracket that disappears between derivations (rare, but the source prose can change) would
// otherwise survive as a stale threshold no upsert touches — delete each table's rows first.
if (householdIncomeRows.length > 0) {
  await request(
    'DELETE',
    `income_eligibility_thresholds?income_eligibility_id=in.(${householdIncomeRows.map((r) => r.id).join(',')})`,
  );
}
const writtenThresholds = await upsert(
  'income_eligibility_thresholds',
  thresholdRows,
  'income_eligibility_id,household_size',
);
console.log(`pushed ${writtenThresholds.length} income_eligibility_thresholds rows`);

const writtenFilters = await upsert('basic_eligibility_filters', filterRows, 'benefit_program_id');
console.log(`pushed ${writtenFilters.length} basic_eligibility_filters rows`);

// 3. eligibility_rules — min_age/max_age, the one thing this table's own column comment names as
// an intended use. No unique constraint exists on (benefit_program_id, rule_key), so idempotency
// comes from deleting each touched program's rows before re-inserting rather than an upsert.
const ruleRows = [];
for (const program of catalogue.programs) {
  const benefitProgramId = benefitProgramIdByCode.get(program.id);
  const c = criteriaById.get(program.id)?.criteria ?? {};
  if (c.minAge !== undefined) {
    ruleRows.push({ benefit_program_id: benefitProgramId, rule_key: 'min_age', rule_value: String(c.minAge) });
  }
  if (c.maxAge !== undefined) {
    ruleRows.push({ benefit_program_id: benefitProgramId, rule_key: 'max_age', rule_value: String(c.maxAge) });
  }
}
const touchedProgramIds = [...benefitProgramIdByCode.values()];
if (touchedProgramIds.length > 0) {
  await request(
    'DELETE',
    `eligibility_rules?benefit_program_id=in.(${touchedProgramIds.join(',')})&rule_key=in.(min_age,max_age)`,
  );
}
if (ruleRows.length > 0) {
  await request('POST', 'eligibility_rules', ruleRows.map((row) => ({
    ...row,
    effective_from: fetchedAtDate,
    fetched_at: catalogue.fetchedAt,
  })));
}
console.log(`pushed ${ruleRows.length} eligibility_rules rows (min_age/max_age)`);

console.log('\nnot seeded — see the module comment for why:');
console.log(`  required document categories : ${catalogue.programs.length} programs, no column`);
console.log('  scorable/method/partial/unchecked/sources/renewal : no table');
console.log('  categorical age_group list : not present in programs.runtime.json');
