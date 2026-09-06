import { FEATURE_FLAGS } from '@/config/feature-flags';
import * as jsonCatalogue from './json-catalogue';
import * as postgresCatalogue from './postgres-catalogue';

/**
 * The seam `generic-evaluator.ts`/`eligibility-engine.ts` actually depend on. Neither of those two
 * files knows or needs to know which implementation is active — they only ever import `programs`,
 * `programById`, `criteriaFor`, `scorablePrograms`, and `incomeLimitFor` from here.
 *
 * `FEATURE_FLAGS.databaseBackedCatalogue` (env `DATABASE_BACKED_CATALOGUE`, default off) picks
 * `postgres-catalogue.ts` instead of the long-standing `json-catalogue.ts`. See
 * `postgres-catalogue.ts`'s own module comment for exactly which fields that path genuinely reads
 * from Postgres versus still reads from the same generated JSON `json-catalogue.ts` uses — it is a
 * real but partial database integration, not a full replacement, and that's a property of the
 * schema, not a shortcut taken here.
 */

const impl = FEATURE_FLAGS.databaseBackedCatalogue ? postgresCatalogue : jsonCatalogue;

export type {
  DocumentCategory,
  Program,
  ProgramCriteria,
  ProgramCriteriaRecord,
  ProgramRenewal,
} from './json-catalogue';

// Informational only (when the JSON snapshot was captured) — not read by generic-evaluator.ts or
// eligibility-engine.ts today. Always describes the JSON file, which both implementations read at
// least some fields from; there is no equivalent live-data timestamp on the Postgres side to
// prefer instead.
export const catalogueFetchedAt: string = jsonCatalogue.catalogueFetchedAt;

/**
 * Populates whichever implementation is active. A real, awaited load for the Postgres path (see
 * `postgres-catalogue.ts`); an immediately-resolved no-op for the JSON path, which has nothing to
 * load — the JSON files are already read at import time. `server.ts` awaits this once, before
 * accepting requests, so `programs`/`programById`/`criteriaFor`/`scorablePrograms` below can stay
 * synchronous either way.
 */
export function initializeCatalogue(): Promise<void> {
  return impl.initialize();
}

/**
 * `programs` needs to be a plain, live array (not a function) because `generic-evaluator.ts`'s
 * `evaluateAll()` calls `.map()` on it directly. Re-exporting the implementation's own array
 * reference — rather than copying it — is what lets `postgres-catalogue.ts` populate it in place
 * after `initializeCatalogue()` resolves and have every importer see the populated data, with no
 * extra plumbing.
 */
export const programs = impl.programs;

export function programById(id: string) {
  return impl.programById(id);
}

export function criteriaFor(id: string) {
  return impl.criteriaFor(id);
}

export function scorablePrograms() {
  return impl.scorablePrograms();
}

/**
 * Pure math, no data dependency either way — kept in `json-catalogue.ts` and reused unchanged
 * regardless of which catalogue implementation is active, rather than duplicated.
 */
export const incomeLimitFor = jsonCatalogue.incomeLimitFor;
