# Validation-to-database and Gemini-to-form-filling alignment audit

Discovery only, per the audit request. Nothing below has been fixed.

Scope note discovered immediately: `backend/` and `src/` are two entirely separate applications
with two entirely separate eligibility systems. `src/data/eligibility.ts` (the Expo app) evaluates
the 97-program static catalogue via `criteriaFor()`/`programById()`. `backend/src/features/eligibility`
(a separate Express service) evaluates exactly 3 hardcoded programs (`fair_fares`, `idnyc`,
`nyc_care`) against a `MockUserProfile`. This audit was scoped to the files the request named, all
of which live in `backend/`. The Postgres tables seeded in the previous session
(`benefit_programs`, `income_eligibility`, `basic_eligibility_filters`, `eligibility_rules`) are
consumed by **neither** system — confirmed by `grep`, zero hits, for all four table names across
both `src/` and `backend/src/`.

## Part 1 — Is eligibility validation database-backed?

**No. `catalogue.ts` (Expo app) and hardcoded per-program validators (`backend/`) are the sole
sources of truth at runtime. The seeded database is real but currently unconsumed by any code
path.**

- `backend/src/features/eligibility/eligibility-engine.ts` calls exactly three hardcoded
  validators — `fairFaresValidator`, `idnycValidator`, `nycCareValidator` (one file each under
  `programs/`) — against a `MockUserProfile` read straight from the request body
  (`readProfile(request.body)` in `benefits.controller.ts`). None of the three read `criteriaFor()`,
  `catalogue.ts`, or any table. Their income limits are hardcoded constants
  (`fair-fares-limits.ts`'s `FAIR_FARES_2026_INCOME_LIMITS`), their age/residency/insurance logic is
  inline comparisons in each validator file.
- Confirmed via `grep -rn "supabase|postgres|pg\b|Pool|createClient"` across all of `backend/src`:
  **zero matches**. There is no database client anywhere in this service. It cannot be reading the
  seeded tables even incidentally.
- `src/data/eligibility.ts` (the Expo app's separate engine) calls `programById()`/`criteriaFor()`
  from `src/data/catalogue.ts`, which are static in-memory lookups over
  `programs.runtime.json`/`program-criteria.generated.json` — the same JSON files
  `push-catalogue.mjs` reads to seed the database, but the app never re-reads them from Postgres.
  Also confirmed zero references to the four eligibility tables anywhere in `src/`.

**What a Postgres equivalent of the mongodb-catalog.provider.ts pattern would need to do** (no such
file exists in this repo today — searched, zero hits — so this describes what building one would
require, not a gap in an existing implementation):

- Implement `BenefitsCatalogProvider` (`backend/src/features/benefits-discovery/adapters/benefits-catalog-provider.ts`
  — a one-method interface, `getPrograms(programCodes?): Promise<BenefitProgram[]>`), querying
  `benefit_programs` (+ `income_eligibility`/`basic_eligibility_filters`/`eligibility_rules` for
  the criteria) instead of re-fetching Socrata or reading the fixture array. This would sit
  alongside `NycBenefitsCatalogProvider`/`FixtureCatalogProvider` as a third option in
  `discoverBenefits()`'s `dependencies.catalogProvider ?? (...)` selection.
  Would need its own `programId` decision — see Part 2, which shows the existing providers already
  disagree with each other and with the hardcoded validators, so a fourth id source, added
  carelessly, would make the mismatch worse, not better.
- Separately, the *eligibility engine itself* (`checkEligibility`/`PROGRAM_VALIDATORS`) would need
  an equivalent provider to replace its hardcoded validators — reading `income_eligibility`,
  `income_eligibility_thresholds`, `basic_eligibility_filters`, and `eligibility_rules`
  (`min_age`/`max_age`) for a given `benefit_programs.code`, and evaluating them the way
  `src/data/eligibility.ts`'s `evaluate()` already does against `criteriaFor()`'s in-memory shape.
  That evaluation logic does not exist in `backend/` at all today — the 3 hardcoded validators
  are each program-specific, not a generic criteria-interpreter — so this is new code, not a
  swap-in.
- Neither of the above exists. This is a real gap, but it is a missing-feature gap, not a bug:
  nothing currently claims to read the database for eligibility, so nothing is currently wrong by
  not doing so.

### `profile-validation.ts` vs. the live database's actual constraints

Checked every rule in `backend/src/features/eligibility/profile-validation.ts` against the
corresponding live `CHECK` constraints in `supabase/migrations/20260101000003_healthcare_transportation.sql`
and `database/schema.sql`. All of them match exactly — moot in the sense that nothing wires this
validator to the database (see above), but accurate, so a future Postgres-backed profile writer
would not need to change these value sets:

| Rule in `profile-validation.ts` | Live constraint | Match? |
|---|---|---|
| `INSURANCE_ELIGIBILITY_VALUES = {'eligible','not_eligible','unknown'}` | `applicant_healthcare.insurance_eligibility CHECK (... IN ('eligible','not_eligible','unknown'))` | Exact match |
| `FAIR_FARES_DISCOUNT_TYPES = {'subway_bus','access_a_ride'}` | `applicant_transportation.fair_fares_discount_type CHECK (... IN ('subway_bus','access_a_ride'))` | Exact match |
| `household.householdSize` must be `>= 1` | `households.household_size CHECK (household_size > 0)` | Exact match |
| `household.annualIncome` must be `>= 0` | `households.annual_household_income NUMERIC(12,2)`, no CHECK | App validation is stricter than the DB (fine — DB just doesn't enforce it) |
| `identity.dateOfBirth` must be ISO `YYYY-MM-DD` | `applicant_profiles.date_of_birth DATE NOT NULL` | Not a real conflict — `DATE` accepts any valid date, app's regex is just a stricter pre-check |

No mismatches found here. The concept-level field names differ (`householdSize` vs.
`household_size`, as expected for camelCase-vs-snake_case), and `MockUserProfile.household` maps
conceptually to `households`, `MockUserProfile.residence` to `addresses` — but again, nothing
actually connects them at runtime.

## Part 2 — Does `programId` stay consistent from discovery through form-payload?

**No — this one is a live, reachable, currently-broken mismatch, not merely disconnected.** It
reproduces the same *shape* of bug the previous session found and fixed in `profile-repository.ts`,
but here it's active under this repo's own documented default configuration, not inert.

### The privacy boundary (2.1) — confirmed real, not just named

`to-benefit-recommendation-context.ts`'s `toBenefitRecommendationContext()` genuinely produces a
`SafeRecommendationContext`: exact `annualIncome` is banded (`under_25k`/`25k_to_50k`/`50k_to_100k`/
`100k_plus`) via `incomeBand()`, and no name, DOB, address, or identifier field is included — only
`age`, `nycResident`, `householdSize`, the income band, employment/student flags, insurance flags,
and a derived `transportationNeeds` boolean. This is what actually gets sent to Gemini
(`buildGeminiEnhancementRequest`'s `context` field). The boundary holds in the real code.

### Gemini cannot inject a mismatched id (2.2) — confirmed guarded

`gemini-benefit-explanation.provider.ts`'s `isGeminiProgramMatch()` validates every returned match
against `allowedIds = new Set(programs.map(p => p.programId))` — the exact ids sent in the request.
A Gemini response naming any other id is filtered out by `.filter((item): item is GeminiProgramMatch
=> isGeminiProgramMatch(item, allowedIds))`, and if nothing survives that filter but Gemini did
return something, the provider throws (`'Gemini returned no valid catalog matches.'`) rather than
silently accepting an invented id. This risk is real in principle but is already closed in code.

### Where `programId` actually diverges (2.3 / 2.4) — the real finding

Four hardcoded, mutually-consistent call sites all key on the same **lowercase-snake-case literal
scheme** (`'fair_fares'`, `'idnyc'`, `'nyc_care'`):

- `backend/src/features/eligibility/programs/{fair-fares,idnyc,nyc-care}.ts` — each validator's
  `programId` field.
- `backend/src/controllers/benefits.controller.ts`'s `SUPPORTED_PROGRAM_IDS` gate on
  `POST /:programId/validate`.
- `backend/src/controllers/forms.controller.ts`'s `SUPPORTED_PROGRAM_IDS` gate on
  `POST /:programId/payload`.
- `backend/src/features/form-payload/mappings.ts`'s `PROGRAM_FORM_MAPPINGS` keys (and each
  `config/*.mapping.ts` file's own `programId` field, e.g. `idnyc.mapping.ts`'s `programId: 'idnyc'`).

This literal scheme matches exactly one catalog source: `fixture-catalog.provider.ts`
(`{ programId: 'fair_fares', ... }`, `{ programId: 'idnyc', ... }`).

It does **not** match the other catalog source, `nyc-benefits-catalog.provider.ts`
(`NycBenefitsCatalogProvider`), which derives its own `programId` at request time from the live
Socrata dataset:

```js
const programId = (field(record, 'unique_id_number') ?? programName)
  .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
```

Verified concretely against the same underlying City dataset row this repo already has a local copy
of (`src/data/programs.generated.json`, same `unique_id_number` field):

| Program | `unique_id_number` (raw) | `NycBenefitsCatalogProvider`'s derived `programId` | Hardcoded validator/mapping `programId` |
|---|---|---|---|
| IDNYC | `P032en` | `p032en` | `idnyc` |
| Fair Fares NYC | `P120en` | `p120en` | `fair_fares` |

These never match. And **`liveBenefitsCatalog` defaults to `true`**
(`backend/src/config/feature-flags.ts`: `enabled('LIVE_BENEFITS_CATALOG', true)`, commented "the
official catalog is the preferred broad-discovery source") — so `discoverBenefits()` uses
`NycBenefitsCatalogProvider` by default, not the fixture provider. `GEMINI_ENABLED` defaults to
`false`, so by default Gemini plays no part; `discoverBenefits()` falls back to `fallbackMatch()`,
which just echoes `program.programId` through unchanged — the live-derived id reaches the client
either way, with or without Gemini in the loop.

**The concrete break, reachable through real routes** (`benefits.routes.ts` / `forms.routes.ts` —
these are live, mounted routes, not dead code):

1. Client calls `POST /discover`. Under the default config, this returns `BenefitRecommendation[]`
   including IDNYC with `programId: "p032en"`.
2. `discover-benefits.ts`'s `supportsDetailedValidation()` checks `programId`, `programCode`, *and*
   `programName` (OR'd), and `BENEFITS_CONFIG.deepValidationProgramNames` includes the literal
   string `'IDNYC'`, which does match this program's `programName`. So the response correctly
   advertises `detailedValidationSupported: true` and `formAutomationSupported: true` for this
   program — the discovery layer's own three-way fallback (id/code/name) protects it from this
   exact mismatch.
3. Client, following that advertised capability, calls `POST /p032en/validate` (the `programId` it
   was just given). `benefits.controller.ts`'s `SUPPORTED_PROGRAM_IDS.has('p032en')` is `false` —
   that set only ever contains the literal `'idnyc'`, with **no** code/name fallback the way step 2
   had. Response: `404 DETAILED_VALIDATION_NOT_SUPPORTED`.
4. Same failure mode one step later even if step 3 somehow used the literal `'idnyc'`: `forms.controller.ts`'s
   own separate `SUPPORTED_PROGRAM_IDS` set and `PROGRAM_FORM_MAPPINGS` object have the identical
   gap — keyed on the literal 3 ids, no fallback — so `POST /idnyc/payload` would work but
   `POST /p032en/payload` throws `No form mapping is configured for program: p032en` inside
   `generateFormPayload()`.

So the discovery step *promises* detailed validation and form automation for IDNYC, Fair Fares, and
NYC Care (via its generous id/code/name matching), and the very next two steps in the chain — the
ones that would actually deliver on that promise — only ever recognize the literal fixture-style
ids and have no equivalent fallback. This is silently broken today, by default, for exactly the 3
programs the rest of the system was built to support.

A secondary, lower-severity observation noticed in passing: `nyc-benefits-catalog.provider.ts`
fetches `https://data.cityofnewyork.us/api/views/yjpx-srhp/rows.json` while `scripts/ingest-programs.mjs`
(the Expo app's ingestion, feeding `catalogue.ts`) fetches dataset `kvhd-5fmu` — two different
Socrata view ids for what the field names (`unique_id_number`, `program_code`, `program_name`,
`plain_language_eligibility`) suggest is the same underlying multilingual dataset (one, `yjpx-srhp`,
filtered to `language === 'English'` rows client-side; the other apparently already English-only).
Not verified live (would require a network call this audit didn't make), and not part of the
`programId` chain finding above, but worth a human's attention if these ever need to agree on
exactly the same program set.

## Summary, most to least serious

1. **Silently broken, live, on by default**: `programId` from `NycBenefitsCatalogProvider` (the
   default catalog source) never matches the hardcoded ids used by the eligibility validators, the
   `/validate` route's `SUPPORTED_PROGRAM_IDS` gate, or the `/payload` route's
   `PROGRAM_FORM_MAPPINGS`/`SUPPORTED_PROGRAM_IDS` gate — for the exact 3 programs (Fair Fares,
   IDNYC, NYC Care) this system was built around. The discovery response actively advertises
   `detailedValidationSupported`/`formAutomationSupported: true` for them anyway (via a code/name
   fallback the later steps don't share), so a client following that advertisement hits a 404 or a
   thrown error. This is the priority fix.
2. **Disconnected but each internally correct (inert, not wrong)**: the seeded Postgres tables
   (`benefit_programs`, `income_eligibility`, `income_eligibility_thresholds`,
   `basic_eligibility_filters`, `eligibility_rules`) are fully populated and correct, and
   `profile-validation.ts`'s value sets already match the live schema's `CHECK` constraints exactly
   — but nothing in either `src/` or `backend/` queries these tables, so none of this is live yet.
   Building the database-backed provider(s) described in Part 1 is a real, but separate, feature
   gap.
3. **Confirmed working as designed**: the Gemini privacy boundary (banded income, no raw PII) and
   the guard against Gemini inventing/altering a `programId` are both genuinely enforced in code,
   not just implied by type names.
