#!/usr/bin/env node
/**
 * Pulls the NYC Benefits and Programs catalogue into a committed JSON file.
 *
 *   node scripts/ingest-programs.mjs
 *
 * Source: NYC Open Data dataset kvhd-5fmu, the same one `NycBenefitsCatalogProvider` on the
 * validation-system branch reads. No API token is needed — Socrata throttles anonymous callers
 * but this runs at build time, not per user, so the app makes zero Socrata requests at runtime.
 *
 * The City's copy is HTML. We keep two forms of every field that matters: `text` for display and
 * matching, and the untouched original in `*_html` where the markup carries meaning (lists of
 * requirements, mostly). Nothing is paraphrased — a benefits rule the user cannot trace back to
 * the City's own wording is not worth showing.
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DATASET = 'kvhd-5fmu';
const ENDPOINT = `https://data.cityofnewyork.us/resource/${DATASET}.json`;
const LANDING_PAGE = `https://data.cityofnewyork.us/d/${DATASET}`;
const PAGE_SIZE = 500;

const here = dirname(fileURLToPath(import.meta.url));
/** Full record, for scripts and for auditing what the City actually said. Never imported by the app. */
const OUT = join(here, '..', 'src', 'data', 'programs.generated.json');
/** Only the fields screens render. This is the one the bundle pays for. */
const OUT_RUNTIME = join(here, '..', 'src', 'data', 'programs.runtime.json');

/** Socrata writes the string "NULL" rather than omitting the column. */
function clean(value) {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed === '' || trimmed === 'NULL' ? undefined : trimmed;
}

/**
 * HTML → readable text.
 *
 * List items become "· " bullets rather than being flattened, because in this dataset the list
 * structure *is* the eligibility logic — "all of these" versus "any of these" is carried by the
 * markup as much as by the prose.
 */
function toText(html) {
  const raw = clean(html);
  if (!raw) return undefined;
  return raw
    .replace(/<li[^>]*>/gi, '\n· ')
    .replace(/<\/(p|div|ul|ol|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

/** Comma-separated Socrata columns, split and tidied. */
function toList(value) {
  const raw = clean(value);
  return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

async function fetchAll() {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = `${ENDPOINT}?$limit=${PAGE_SIZE}&$offset=${offset}&$order=unique_id_number`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (response.status === 429) {
      throw new Error('Socrata throttled the request. Wait a minute and re-run, or add an app token.');
    }
    if (!response.ok) {
      throw new Error(`Socrata responded ${response.status} ${response.statusText}`);
    }
    const page = await response.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function normalize(row) {
  const applyUrls = {
    online: clean(row.url_of_online_application),
    pdf: clean(row.url_of_pdf_application_forms),
    inPerson: clean(row.office_locations_url),
  };

  return {
    // `unique_id_number` is the actual key. `program_code` is NOT unique -- 43 of the 97 rows
    // carry the literal string "N/A" -- so using it as an id collapses them into one another and
    // produces duplicate React keys in the list.
    id: clean(row.unique_id_number),
    programCode: clean(row.program_code) === 'N/A' ? undefined : clean(row.program_code),
    name: clean(row.program_name) ?? 'Unnamed program',
    acronym: clean(row.program_acronym),
    plainLanguageName: clean(row.plain_language_program_name),
    category: clean(row.program_category),
    agency: clean(row.government_agency),
    populationServed: toList(row.population_served),
    ageGroup: clean(row.age_group),

    summary: toText(row.brief_excerpt),
    description: toText(row.program_description),
    headsUp: toText(row.heads_up),

    // The two fields the whole feature rests on. Kept verbatim as well as as text, because the
    // structured criteria derived from them must remain traceable to the City's own wording.
    eligibilityText: toText(row.plain_language_eligibility),
    eligibilityHtml: clean(row.plain_language_eligibility),
    requiredDocumentsText: toText(row.required_documents_summary),

    howToApply: {
      summary: toText(row.how_to_apply_summary),
      online: toText(row.how_to_apply_or_enroll_online),
      byMail: toText(row.how_to_apply_or_enroll_by_mail),
      inPerson: toText(row.how_to_apply_or_enroll_in_person),
      byPhone: toText(row.how_to_apply_or_enroll_by_phone),
    },
    applyUrls,

    getHelp: {
      summary: toText(row.get_help_summary),
      inPerson: toText(row.get_help_in_person),
      online: clean(row.get_help_online),
      email: clean(row.get_help_by_email),
      phone: clean(row.get_help_by_calling_other_than_311),
      call311: clean(row.get_help_by_calling_311) !== undefined,
    },

    source: {
      dataset: DATASET,
      url: LANDING_PAGE,
      updatedAt: clean(row.updated_at),
    },
  };
}

const rows = await fetchAll();
const english = rows.filter((row) => (clean(row.language) ?? 'English') === 'English');
const programs = english.map(normalize).filter((p) => p.id).sort((a, b) => a.name.localeCompare(b.name));

const withEligibility = programs.filter((p) => p.eligibilityText).length;
const withDocuments = programs.filter((p) => p.requiredDocumentsText).length;

await writeFile(
  OUT,
  `${JSON.stringify(
    {
      // Stamped so a stale catalogue is visible rather than silently assumed current.
      fetchedAt: new Date().toISOString(),
      dataset: DATASET,
      sourceUrl: LANDING_PAGE,
      count: programs.length,
      programs,
    },
    null,
    2,
  )}\n`,
);

/**
 * The lean copy. The long prose fields — full description, per-channel how-to-apply, get-help
 * contact blocks — are four fifths of the payload and none of it is rendered today. Dropping them
 * keeps the shipped catalogue small; the full record stays on disk for scripts and auditing.
 */
const runtime = programs.map((p) => ({
  id: p.id,
  // Kept because the NYC Screening API matches on it; absent for most rows.
  programCode: p.programCode,
  name: p.name,
  acronym: p.acronym,
  plainLanguageName: p.plainLanguageName,
  category: p.category,
  agency: p.agency,
  populationServed: p.populationServed,
  summary: p.summary,
  eligibilityText: p.eligibilityText,
  requiredDocumentsText: p.requiredDocumentsText,
  applyUrl: p.applyUrls.online ?? p.applyUrls.pdf ?? p.applyUrls.inPerson,
  sourceUrl: p.source.url,
}));

await writeFile(
  OUT_RUNTIME,
  `${JSON.stringify({ fetchedAt: new Date().toISOString(), dataset: DATASET, count: runtime.length, programs: runtime }, null, 2)}\n`,
);

console.log(`Ingested ${programs.length} programs from ${DATASET}`);
console.log(`  with eligibility text : ${withEligibility}`);
console.log(`  with required documents: ${withDocuments}`);
console.log(`  full record  -> ${OUT}`);
console.log(`  app bundle   -> ${OUT_RUNTIME}`);
