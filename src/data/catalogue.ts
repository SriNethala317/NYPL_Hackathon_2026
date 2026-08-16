import criteriaFile from './program-criteria.generated.json';
import catalogueFile from './programs.runtime.json';

import type { DocumentCategory } from '@/theme';

/**
 * The real NYC benefits catalogue.
 *
 * Both JSON files are generated, never hand-edited:
 *   `node scripts/ingest-programs.mjs`   → programs.runtime.json   (97 programs, NYC Open Data)
 *   `node scripts/derive-criteria.mjs`   → program-criteria.generated.json
 *
 * Ingestion happens at build time, so the app makes no Socrata requests at runtime and works
 * offline. The trade is staleness: `fetchedAt` says how old this copy is, and re-running the
 * script is the only way it changes.
 */

export type Program = {
  /** `unique_id_number` from the dataset. `program_code` is not unique and cannot be used here. */
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
  /** The City's own eligibility wording, plain text. Shown verbatim; never paraphrased. */
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

export type ProgramCriteriaRecord = {
  programId: string;
  programName: string;
  /**
   * Whether we can actually check this program. False means the rules exist only as prose we
   * could not parse — the app must show it as browsable, never score it.
   */
  scorable: boolean;
  method: 'heuristic' | 'llm' | 'unmatched';
  criteria: ProgramCriteria;
  /** The City's own sentence behind each criterion, quotable in the UI. */
  sources: Partial<Record<'nycResident' | 'age' | 'income', string>>;
  sourceUrl?: string;
};

export const catalogueFetchedAt: string = catalogueFile.fetchedAt;
export const programs = catalogueFile.programs as Program[];

const criteriaById = new Map<string, ProgramCriteriaRecord>(
  (criteriaFile.programs as ProgramCriteriaRecord[]).map((record) => [record.programId, record]),
);

export function programById(id: string): Program | undefined {
  return programs.find((program) => program.id === id);
}

export function criteriaFor(id: string): ProgramCriteriaRecord | undefined {
  return criteriaById.get(id);
}

/** Programs we can actually score, which is a subset of the catalogue. */
export function scorablePrograms(): Program[] {
  return programs.filter((program) => criteriaById.get(program.id)?.scorable);
}

/** Distinct categories, for filtering a 97-item list into something browsable. */
export function programCategories(): string[] {
  return [...new Set(programs.map((p) => p.category).filter((c): c is string => Boolean(c)))].sort();
}

/**
 * The income ceiling for a given household size.
 *
 * Beyond the largest published bracket the agency states a per-person increment; applying it is
 * what the agency itself instructs, so a household of 12 is not silently treated as a household
 * of 8.
 */
export function incomeLimitFor(criteria: ProgramCriteria, householdSize: number): number | undefined {
  if (criteria.annualIncomeCap !== undefined) return criteria.annualIncomeCap;

  const table = criteria.annualIncomeByHouseholdSize;
  if (!table) return undefined;

  const size = Math.max(1, Math.trunc(householdSize) || 1);
  const direct = table[String(size)];
  if (direct !== undefined) return direct;

  const sizes = Object.keys(table).map(Number).sort((a, b) => a - b);
  const largest = sizes[sizes.length - 1];
  if (size <= largest) return table[String(largest)];

  const increment = criteria.additionalPersonIncrement;
  if (increment === undefined) return table[String(largest)];
  return table[String(largest)] + (size - largest) * increment;
}
