#!/usr/bin/env node
/**
 * Pushes the ingested NYC catalogue into Supabase.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/push-catalogue.mjs
 *
 * Run after `ingest-programs.mjs` and `derive-criteria.mjs`, and after applying
 * `supabase/migrations/0001_initial.sql`.
 *
 * This is the one place the service-role key is used, and it is a local script — never the app.
 * That key bypasses every row-level policy, so putting it in a bundle would make the whole RLS
 * design decorative. It is read from the environment and never written to disk.
 *
 * The catalogue is public data: these two tables are world-readable and have no insert policy, so
 * only this script can write them.
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

const programs = catalogue.programs.map((p) => ({
  id: p.id,
  program_code: p.programCode ?? null,
  name: p.name,
  acronym: p.acronym ?? null,
  category: p.category ?? null,
  agency: p.agency ?? null,
  summary: p.summary ?? null,
  eligibility_text: p.eligibilityText ?? null,
  required_documents_text: p.requiredDocumentsText ?? null,
  apply_url: p.applyUrl ?? null,
  source_url: p.sourceUrl,
  fetched_at: catalogue.fetchedAt,
}));

const rules = criteria.programs.map((c) => ({
  program_id: c.programId,
  scorable: Boolean(c.scorable),
  partial: Boolean(c.partial),
  unchecked: c.unchecked ?? [],
  criteria: c.criteria ?? {},
  sources: c.sources ?? {},
  renewal: c.renewal ?? null,
}));

/** Upsert, so re-running after a fresh ingest updates in place rather than duplicating. */
async function upsert(table, rows, conflictColumn) {
  const response = await fetch(`${url}/rest/v1/${table}?on_conflict=${conflictColumn}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    throw new Error(`${table}: ${response.status} ${response.statusText}\n${await response.text()}`);
  }
}

// Programmes first: program_criteria has a foreign key onto them.
await upsert('programs', programs, 'id');
console.log(`pushed ${programs.length} programmes`);

await upsert('program_criteria', rules, 'program_id');
console.log(`pushed ${rules.length} criteria rows`);
console.log(`  scorable : ${rules.filter((r) => r.scorable).length}`);
console.log(`  partial  : ${rules.filter((r) => r.partial).length}`);
