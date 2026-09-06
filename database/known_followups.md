# Known follow-ups — running backlog

Consolidated from every investigation file in `database/`, cross-checked against the current code
and a live query against the Supabase project just now — not carried forward from memory of what
each session reported. Closed items are listed at the bottom for traceability, not left in the
open list.

## Architecture gaps (real, not bugs — nothing lies or crashes, but real capability is missing)

**The seeded Postgres eligibility tables are still 100% unconsumed by any runtime code — more
completely than earlier sessions expected.**
`benefit_programs`, `income_eligibility`, `income_eligibility_thresholds`,
`basic_eligibility_filters`, `eligibility_rules` remain fully seeded and correct (97/27/175/97/28
rows, confirmed live just now). But `backend/`'s generic eligibility engine
(`generic-catalogue.ts`) reads criteria from two JSON files copied into `backend/src/data/`
(`program-criteria.generated.json`, `programs.generated.json`) — confirmed by re-reading the
import statements and re-running `grep -rn "supabase|postgres|createClient" backend/src`: zero
hits, same as before the engine was built. `generic_eligibility_engine_scoping.md` (the doc that
scoped this engine) expected at least the *numeric* criteria (age/income) to come from Postgres,
with only the explanation-layer fields (`partial`/`unchecked`/`sources`/`requiredCategories`)
falling back to JSON as "Option B." What actually got built uses JSON for everything — a bigger
gap than originally scoped, and not one this session's cross-check found stated anywhere as a
deliberate decision. First found: `validation_and_gemini_alignment_audit.md`. Status: dormant,
functionally harmless (same underlying data either way) but worth a real decision on whether the
DB-reading provider described in that audit's Part 1 is still wanted.

**System B (the IDNYC-specific PDF-filling pipeline under `src/features/documents/`) is real,
tested, and completely unreachable.** `checkEligibility → generateFormPayload →
toIdNycAutomationInput → fillIdNycForm` runs and passes today (re-verified plausible via the
existing `npm run test:idnyc:integration` script), but nothing in the live mobile app or the live
`backend/` Express routes calls its two entry points — only that standalone script does. Wiring it
in is "add a route/screen calling two already-working functions," not new engineering. First
found: `pdf_filling_connection_investigation.md`.

**System B's PDF template is stale.** It fills a locally-committed copy of the IDNYC form
(`Forms/IDNYCForm.pdf`) that `src/features/forms/templates.ts`'s own comment already says doesn't
match either current City revision. Fixing means re-deriving `idnyc-form-fields.ts` against the
real current PDF, or retiring System B for System A (which already fetches the live PDF). First
found: `pdf_filling_connection_investigation.md`.

**Two unreconciled IDNYC PDF-filling implementations exist side by side**, and nothing decides
which is authoritative: System A (`src/features/forms/`, live, reachable, current PDF, app's own
local profile) and System B (above — dormant, tested, backend's payload, stale PDF). First found:
`pdf_filling_connection_investigation.md`.

**No PDF-filling destination exists for any program except IDNYC.** `generate-form-payload.ts` now
produces a real payload for all ~49 scorable programs (Fair Fares/NYC Care via their specific
mappings, everyone else via the generic 9-field fallback), but only IDNYC has an adapter into an
actual PDF filler at all. Fair Fares and NYC Care specifically were called out in
`pdf_filling_connection_investigation.md`; confirmed just now that the later generic-fallback work
didn't change this — `templates.ts` still lists only `P005en`/`P015en`/`P032en`, so the other ~46
generically-covered programs have the same absence, not a new one.

**No route anywhere triggers PDF filling for any program.** Even for IDNYC, the only caller of
System B is the standalone integration script. First found:
`pdf_filling_connection_investigation.md`.

## Research / design decisions needed (not urgent, no live impact)

**`derive-criteria.mjs`'s residency-detection heuristic has a real, confirmed gap.** It only
recognizes "resident(s) of NYC" / "live in NYC" phrasing; IDNYC's actual eligibility text ("All New
Yorkers ages 10 and up qualify") doesn't match, so IDNYC's derived criteria has no `nycResident`
rule at all, unlike the old hardcoded validator it replaced. Not fixed — flagged as follow-up work
for the heuristic script itself. First found and left open by the generic-engine port session.

**The generic form-payload fallback's 9 fields are a reasonable default, not verified against any
of the ~46 other programs' real application forms.** Explicitly and deliberately unverified —
building real per-program mappings for them is the same kind of research work (reading actual PDF
field names off actual documents) that produced the original 3. First found and left open by the
generic-fallback session itself.

**`form_versions`/`form_fields`: the blocking half is closed, a smaller design question remains.**
`applications.form_version_id` is nullable (migration `20260101000009`, confirmed live:
`is_nullable = YES`) — `submitApplication()` writes `form_version_id: null` and works. The tables
themselves are still empty (confirmed live: 0 rows) with no client write path. Whether to
eventually drop them or populate them from the TS mapping configs (Options 2/3 in
`form_versions_investigation.md`) is unresolved, but no longer blocks anything — downgrade from
"decision needed" to "optional cleanup, low priority."

**The `yjpx-srhp` vs `kvhd-5fmu` Socrata dataset-id mismatch** between `nyc-benefits-catalog.provider.ts`
(live discovery) and `ingest-programs.mjs` (the Expo app's/backend's static catalogue source) —
noted in passing, never independently verified live, never revisited since. First found:
`validation_and_gemini_alignment_audit.md`.

## Confirmed closed — cross-checked against current code/live DB just now, not carried forward

- `src/features/backend/profile-repository.ts`'s entire stale-reference list
  (`legacy_reference_audit.md`) — rewritten against the real schema in an early session; every
  function in that file now reads/writes the real tables and columns.
- `benefit_programs.code` mixed-case vs. the live discovery layer's lowercased id — fixed at seed
  time (`scripts/push-catalogue.mjs` now lowercases); confirmed live, all rows lowercase.
- **`catalogue.ts`/`templates.ts`'s `programById`/`criteriaFor`/`templateFor` mixed-case matching
  — confirmed closed just now, correcting this command's own "expected still-open" assumption.**
  Re-read the current source: all three already normalize with `.toLowerCase()` on both sides of
  the comparison (`normalizeProgramId` in `catalogue.ts`, inline in `templates.ts`), committed in
  the generic-engine-port session and verified there via a real `programById("p120en")` round
  trip.
- `basic_eligibility_filters.requires_nyc_residency` seeded from the schema default instead of the
  real per-program signal — fixed; confirmed live just now, 20 true / 77 false, matching
  `program-criteria.generated.json` exactly.
- The `programId` chain break between `/discover`, `/validate`, and `/payload` for Fair Fares,
  IDNYC, and NYC Care (hardcoded `SUPPORTED_PROGRAM_IDS` gates with no id/code/name fallback) —
  fixed via `program-id-resolver.ts` and the later generic-engine controller updates.
- `formAutomationSupported` advertising true for programs `/payload` would then 404 on — fixed;
  now backed by real `PROGRAM_FORM_MAPPINGS` membership (`formAutomationSource` distinguishes
  program-specific from generic-fallback).
- Gemini privacy boundary (banded income, no raw PII) and the guard against Gemini
  inventing/altering a `programId` — confirmed working as designed, never were bugs.
- `saveDocument()`'s insert-never-upsert behavior, `deleteMyData()`'s RLS policy and cascade, and
  the reconciliation engine's authority-precedence rule — confirmed working for real against the
  live database, never were bugs.
- `loadProfile()`'s `PersistedProfile` vs. `backend/`'s `MockUserProfile` shape mismatch — moot,
  not fixed: the real in-app submission flow (`app-store.tsx`'s `submit()`, built later) bypasses
  `backend/`'s HTTP API entirely and builds its own payload from local state, so no adapter between
  the two shapes was ever needed.
