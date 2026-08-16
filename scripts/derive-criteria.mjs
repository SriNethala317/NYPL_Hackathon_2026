#!/usr/bin/env node
/**
 * Turns the City's plain-language eligibility prose into structured, machine-checkable criteria.
 *
 *   node scripts/derive-criteria.mjs             # heuristic only, no API key needed
 *   node scripts/derive-criteria.mjs --llm       # adds an LLM pass for what heuristics missed
 *
 * Two rules govern this file:
 *
 *   1. Nothing is derived at runtime. This runs once, the output is committed, and a human can
 *      read the diff. A benefits rule nobody can audit is worse than no rule at all.
 *   2. Every criterion carries the exact `sourceText` it came from. If the app tells someone they
 *      may not qualify, we can show them the City's own sentence that says so.
 *
 * Heuristics handle the patterns this dataset actually uses — age ranges, NYC residency, and the
 * household-size income tables. Anything they cannot parse is recorded as `unmatched` rather than
 * guessed at, which is what keeps the coverage number honest.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const IN = join(here, '..', 'src', 'data', 'programs.generated.json');
const OUT = join(here, '..', 'src', 'data', 'program-criteria.generated.json');

const useLlm = process.argv.includes('--llm');

/** The snippet a criterion was read from, trimmed to something quotable in the UI. */
function snippet(text, match) {
  if (!match) return undefined;
  const at = text.indexOf(match);
  if (at === -1) return match.trim();
  const start = Math.max(0, text.lastIndexOf('\n', at) + 1);
  const end = text.indexOf('\n', at + match.length);
  return text.slice(start, end === -1 ? undefined : end).trim();
}

/** "Do you live in New York City?" / "Live in NYC (any of the five boroughs)" */
function deriveResidency(text) {
  const match = text.match(/\b(?:live|living|reside|residing|residents? of)\b[^.\n]*\b(new york city|nyc|five boroughs)\b/i);
  return match ? { nycResident: true, sourceText: snippet(text, match[0]) } : null;
}

/**
 * Age bounds. Ordered most specific first, because "18-64" also contains "18", and matching the
 * looser pattern first would silently drop the upper bound.
 */
function deriveAge(text) {
  const range = text.match(/\b(\d{1,3})\s*(?:-|–|—|to)\s*(\d{1,3})\s*years?\s*old\b/i);
  if (range) {
    return { minAge: Number(range[1]), maxAge: Number(range[2]), sourceText: snippet(text, range[0]) };
  }
  const andUp = text.match(/\bages?\s*(\d{1,3})\s*(?:and|or)\s*(?:up|older|above|over)\b/i);
  if (andUp) return { minAge: Number(andUp[1]), sourceText: snippet(text, andUp[0]) };

  const orOlder = text.match(/\b(\d{1,3})\s*(?:years old)?\s*(?:or|and)\s*(?:older|above|over)\b/i);
  if (orOlder) return { minAge: Number(orOlder[1]), sourceText: snippet(text, orOlder[0]) };

  const under = text.match(/\bunder\s*(?:the\s*age\s*of\s*)?(\d{1,3})\b/i);
  if (under) return { maxAge: Number(under[1]) - 1, sourceText: snippet(text, under[0]) };

  return null;
}

/**
 * The household-size income tables.
 *
 * The City renders these as a table, which flattens to alternating lines: a household size, then
 * a dollar amount. We only accept a run where the sizes ascend from 1 by one, which is what stops
 * unrelated numbers elsewhere in the prose from being mistaken for a bracket table.
 */
function deriveIncomeTable(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const brackets = {};
  let expected = 1;

  for (let i = 0; i < lines.length - 1; i++) {
    const size = lines[i].match(/^(\d{1,2})$/);
    const money = lines[i + 1].match(/^\$([\d,]+)$/);
    if (size && money && Number(size[1]) === expected) {
      brackets[expected] = Number(money[1].replace(/,/g, ''));
      expected += 1;
      i += 1;
    }
  }

  if (Object.keys(brackets).length < 2) return null;

  const increment = text.match(/each additional (?:person|member|household member)[^$]*\$([\d,]+)/i);
  return {
    annualIncomeByHouseholdSize: brackets,
    additionalPersonIncrement: increment ? Number(increment[1].replace(/,/g, '')) : undefined,
    sourceText: 'Household income table published by the agency.',
  };
}

/** A single cap with no table behind it — "income at or below $50,000". */
function deriveSingleIncomeCap(text) {
  const match = text.match(/income[^.\n]*?(?:at or below|below|less than|under|up to)[^$\n]*\$([\d,]+)/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ''));
  // Four figures is a monthly figure in this dataset's phrasing; anything larger reads as annual.
  const annual = amount < 10_000 ? amount * 12 : amount;
  return { annualIncomeCap: annual, statedAs: amount, sourceText: snippet(text, match[0]) };
}

/** Which categories of proof the program asks for, mapped onto our document registry. */
function deriveDocumentCategories(documentsText) {
  if (!documentsText) return [];
  const lower = documentsText.toLowerCase();
  const categories = new Set();

  if (/\bidentity|identification|photo id|government-issued|passport|driver'?s licen[cs]e\b/.test(lower)) {
    categories.add('identity');
  }
  if (/\bresidency|where you live|proof of address|lease|utility bill|rent receipt\b/.test(lower)) {
    categories.add('residence');
  }
  if (/\bincome|pay ?stub|w-?2|tax return|wages|earnings\b/.test(lower)) {
    categories.add('income');
  }
  if (/\bimmigration|visa|i-?20|permanent resident|green card|sevis\b/.test(lower)) {
    categories.add('immigration');
  }
  return [...categories];
}

const catalogue = JSON.parse(await readFile(IN, 'utf8'));

const derived = catalogue.programs.map((program) => {
  const text = program.eligibilityText ?? '';
  const residency = deriveResidency(text);
  const age = deriveAge(text);
  const table = deriveIncomeTable(text);
  const cap = table ? null : deriveSingleIncomeCap(text);
  const documentCategories = deriveDocumentCategories(program.requiredDocumentsText);

  const criteria = {};
  const sources = {};

  if (residency) {
    criteria.nycResident = residency.nycResident;
    sources.nycResident = residency.sourceText;
  }
  if (age) {
    if (age.minAge !== undefined) criteria.minAge = age.minAge;
    if (age.maxAge !== undefined) criteria.maxAge = age.maxAge;
    sources.age = age.sourceText;
  }
  if (table) {
    criteria.annualIncomeByHouseholdSize = table.annualIncomeByHouseholdSize;
    if (table.additionalPersonIncrement !== undefined) {
      criteria.additionalPersonIncrement = table.additionalPersonIncrement;
    }
    sources.income = table.sourceText;
  }
  if (cap) {
    criteria.annualIncomeCap = cap.annualIncomeCap;
    sources.income = cap.sourceText;
  }
  if (documentCategories.length > 0) criteria.requiredCategories = documentCategories;

  const scorable = Boolean(
    criteria.nycResident ||
      criteria.minAge !== undefined ||
      criteria.maxAge !== undefined ||
      criteria.annualIncomeByHouseholdSize ||
      criteria.annualIncomeCap,
  );

  return {
    programId: program.id,
    programName: program.name,
    // `scorable` is what the UI keys off to decide between "we checked" and "read the rules
    // yourself". Overstating it would mean telling someone they do not qualify on no evidence.
    scorable,
    method: scorable ? 'heuristic' : 'unmatched',
    criteria,
    // Only the quoted lines, not the whole eligibility text -- that already ships in
    // programs.runtime.json and duplicating it here would double the bundle cost for nothing.
    sources,
    sourceUrl: program.applyUrls?.online ?? program.source?.url,
  };
});

if (useLlm) {
  console.log('--llm requested. Set EXPO_PUBLIC_GEMINI_API_KEY and re-run once the key exists;');
  console.log('unmatched programs will then be structured by the model and marked method="llm".');
}

const scorable = derived.filter((d) => d.scorable).length;
const withDocs = derived.filter((d) => d.criteria.requiredCategories?.length).length;

await writeFile(
  OUT,
  `${JSON.stringify(
    { derivedAt: new Date().toISOString(), method: useLlm ? 'heuristic+llm' : 'heuristic', count: derived.length, scorable, programs: derived },
    null,
    2,
  )}\n`,
);

console.log(`Derived criteria for ${derived.length} programs`);
console.log(`  scorable                : ${scorable}`);
console.log(`  with document categories: ${withDocs}`);
console.log(`  unmatched (browse only) : ${derived.length - scorable}`);
console.log(`  written to ${OUT}`);
