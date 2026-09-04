# Scoping: a generic, all-programs eligibility engine for `backend/`

Investigation only, per this command's scope. Nothing implemented here.

## 1. The "in-progress React project" — real state, checked, not assumed

Ran the exact command specified:

```
$ find . -maxdepth 4 -name "package.json" -not -path "*/node_modules/*" -exec grep -l '"react"' {} \;
./package.json
```

Only one React project exists anywhere in this environment (checked the whole `D:\` drive's
`Hackathon` folder, not just this repo — nothing else there but unrelated PDFs/images and an empty
folder). It is the Expo/React Native app this whole engagement has been working against — it also
builds for web via `react-native-web` + Expo's static web export (`app.json`'s `web.output:
"static"`), which is presumably what "React web project" refers to; there is no separate
Next.js/Vite/CRA codebase anywhere.

There **is** a distinct git branch, `origin/front-end`, that looked at first like it might be the
"already in progress, not greenfield" project the command described — it has its own
`docs/architecture-review.md` (written 2026-08-16, a real, substantive review of the design vs. the
actual pipeline: privacy copy, document retention following IDNYC's zero-retention policy, income
unit bugs in the original design, missing error states, a liability finding about silent
extraction + a certification checkbox). Checked whether it represents unmerged work:

```
$ git merge-base HEAD origin/front-end
2fe4d8948c3a1040c51d09511c035724517bc81d
$ git log HEAD..origin/front-end --oneline | wc -l
0
```

**Zero commits on `front-end` are missing from `HEAD`** — its tip is already an ancestor of the
branch this session has been working on. A full `git ls-tree` diff confirms every file on
`front-end` also exists on `HEAD`, which additionally has the entire `backend/` service, the
redesigned Supabase migrations, and this session's own work; the only thing `front-end` has that
`HEAD` doesn't is the old, pre-redesign `supabase/migrations/0001_initial.sql`, already confirmed
deleted-on-purpose in `database/legacy_reference_audit.md`. **There is no unmerged frontend work
waiting to be reconciled.** The React project already in progress *is* `src/app/`, `src/components/`,
`src/data/` as they exist right now — screens for Home, Enrollment, Program detail, Apply, Review,
Confirmation, Scan, Profile, Privacy all already built (confirmed present, `git ls-tree -r
src/app`), backed by `src/data/eligibility.ts`'s real, working, 97-program local eligibility engine.

Zero HTTP calls to `backend/` exist anywhere in `src/` on either branch — checked
`origin/front-end` specifically as well (`git grep fetch\|axios origin/front-end -- src`), same two
local-only `fetch()` calls as `HEAD` (an image blob, a PDF template). This is consistent with
everything the last several sessions already established, not new information — just confirmed
against the other branch too rather than assumed to carry over.

## 2. What `evaluate()`/`evaluateAll()` actually needs (real, data-driven prior art)

Read `src/data/eligibility.ts` in full (`evaluate()`, `evaluateAll()`, plus `criteriaFor()`/
`programById()`/`scorablePrograms()` from `catalogue.ts`, which it calls).

**Inputs a program's criteria must supply** (from `ProgramCriteria`, `catalogue.ts`):

| Field | Used for |
|---|---|
| `nycResident?: boolean` | Hard fail if `input.nycResident === false` and this is `true` |
| `minAge?`, `maxAge?: number` | Age-range fail; missing `dob` if criteria present but `input.age` absent |
| `annualIncomeByHouseholdSize?: Record<string, number>` | Bracket table lookup via `incomeLimitFor()` |
| `additionalPersonIncrement?: number` | Extrapolation past the largest published bracket |
| `annualIncomeCap?: number` | Flat-limit fallback when no bracket table |
| `requiredCategories?: DocumentCategory[]` | Missing-document-category check |

**Plus, from the wrapping `ProgramCriteriaRecord`** (not just `criteria`):

| Field | Used for |
|---|---|
| `scorable: boolean` | Gate — unscorable programs return `not_screened` immediately, never evaluated |
| `partial?: boolean` | **Safety-critical**: caps every failure at `needs_more_information` instead of `likely_not_eligible` when the parsed rule is only a fragment of the real test |
| `unchecked?: string[]` | Carried into the result so the UI can say "we checked what we could," never asserted as fully checked |
| `sources: {nycResident?, age?, income?: string}` | The City's own quoted sentence behind each criterion — shown to the applicant as the reason, not asserted without citation |

**Plus, from `Program` (the catalogue entry itself, for display, not for the pass/fail logic)**:
`name`, `sourceUrl` — used to build `EligibilityResult.programName`/`source.url`. `evaluate()`
degrades gracefully when `program` is `undefined` or `sourceUrl` is missing (falls back to the
program id and a hardcoded default dataset URL) — this doesn't block scoring, but a generic engine
that wants the real citation for every program needs this too.

**Output shape** (`EligibilityResult`): `status: 'potentially_eligible' | 'needs_more_information' |
'likely_not_eligible' | 'not_screened'` (this app's real vocabulary — confirmed in earlier sessions
as distinct from `backend/`'s current 3-value enum, which has no `not_screened` state at all
because it never encounters an unscorable program), `partial`, `unchecked`, `reasons: string[]`
(codes), `reasonDetails: {code, sourceText?, limit?}[]` (the quotable version), `missingFields:
string[]` (mixes document categories and profile fields — `dob`/`household`/`income` alongside
`identity`/`residence`/`income` categories), `source: {name, url, lastVerified}`.

## 3. Does the seeded database actually cover this? Checked column by column, not assumed

| `evaluate()` needs | DB equivalent | Status |
|---|---|---|
| `criteria.minAge`/`maxAge` | `eligibility_rules` (`rule_key` = `min_age`/`max_age`) | **Covered.** 28 rows seeded. |
| `criteria.annualIncomeByHouseholdSize` + `additionalPersonIncrement` | `income_eligibility` (`type='by_household_size'`) + `income_eligibility_thresholds` | **Covered.** 27 + 175 rows seeded. |
| `criteria.annualIncomeCap` | `income_eligibility` (`type='flat_limit'`, `flat_annual_limit`) | **Covered**, same 27 rows (subset by type). |
| `record.scorable` | *(no direct column, but derivable — see below)* | **Derivable**, not stored directly. |
| `criteria.nycResident` | `basic_eligibility_filters.requires_nyc_residency` | **Looks covered — is not.** See finding below; this is the most important nuance in this report. |
| `criteria.requiredCategories` | *(none)* | **Not covered. Confirmed, no column anywhere**, exactly as flagged in the earlier catalogue-seeding session. |
| `record.partial`, `record.unchecked` | *(none)* | **Not covered. Confirmed, no table anywhere.** |
| `record.sources.*` (quoted `sourceText`) | *(none)* | **Not covered. Confirmed, no table anywhere.** |
| `program.sourceUrl`, `applyUrl`, `agency`, `category`, `eligibilityText`, `requiredDocumentsText`, `populationServed` | *(none — `benefit_programs` only has `id, code, name, description, active, created_at`)* | **Not covered.** Display/citation fields, not scoring inputs, but needed for a faithful `EligibilityResult`. |

**The `requires_nyc_residency` finding, checked live, not assumed:**

```sql
SELECT requires_nyc_residency, count(*) FROM basic_eligibility_filters GROUP BY requires_nyc_residency;
-- true | 97
```

Every single row is `true` — the column's schema default (`DEFAULT TRUE`), never actually
overridden. Compare against the real signal in `program-criteria.generated.json`:

```
programs with criteria.nycResident === true: 20 of 97
```

This is not a missing-column gap like `requiredCategories` — the column exists and is fully
"populated," which makes it easy to mistake for real data. It isn't: the seeding script
(`push-catalogue.mjs`) deliberately left it at the schema default because the heuristic only ever
detects a *positive* residency mention, never a negative one, and writing anything else would have
been inventing evidence — a decision documented and correct at the time, for a column nothing read
back yet. But it means **a generic engine reading `basic_eligibility_filters.requires_nyc_residency`
today would treat all 97 programs as NYC-residency-gated, when only 20 actually are** — a real
behavior regression, not an absence. This has to be fixed (either by actually deriving the column
per-program, or by the generic engine sourcing this one field from the static JSON instead) before
it can drive real scoring; using it as-is today would be worse than not using it.

**The safety-critical gap — `partial`/`unchecked`:**

`evaluate()`'s single most important rule is: *a partial reading may never produce a hard
`likely_not_eligible`.* This is what stopped a real, cited bug — a program whose actual eligibility
test is "65 or older, OR legally blind, OR deaf, ..." collapsing to a hard age-65 floor and telling
a forty-year-old blind rider they didn't qualify. `record.partial`/`record.unchecked` are what gate
this. **Neither exists anywhere in the schema.** A generic engine built purely off today's seeded
tables has no way to know which programs need this protection, and would silently regress it for
all of them — every hard age/income failure would come back as a flat `likely_not_eligible`, with
no fragment-of-the-real-test safety net. This is the gap most worth fixing before anything else,
not `requiredCategories`.

**Conclusion for step 3, stated plainly**: the seeded database covers the *numeric* criteria
(age brackets, income tables/caps) completely and correctly. It does not cover, and currently
cannot safely stand in for: NYC-residency gating (looks covered, isn't — see above),
document-category requirements, the partial/unchecked safety mechanism, per-criterion source
citations, or program display/citation metadata. These are real schema gaps, not something to route
around by guessing values — consistent with the earlier catalogue-seeding session's own finding,
now confirmed to actually matter for scoring, not just for "nice to have" explanatory text.

## 4. What backend/'s 3 hardcoded validators would need to become — and where "generic" breaks down

Re-read `eligibility-engine.ts` and all three `programs/*.ts` validators.

`idnycValidator` (nycResident + `age >= 10`) is **already essentially generic-shaped** — it's a
subset of exactly what `evaluate()`'s criteria table already expresses (residency + a min-age
rule). A generic engine reading the fixed criteria gaps above would reproduce it exactly.

`fairFaresValidator` and `nycCareValidator` are not. Each contains a real, program-specific
business rule that **no generic criteria-table shape captures, and this isn't a missing-column
problem — it's a different kind of condition than the table was ever designed to hold**:

- Fair Fares: automatic disqualification if the applicant `receivesFullCarfare` from another NYC
  agency, or `receivesTransportationDiscount` with `fairFaresDiscountType === 'subway_bus'`. This
  is cross-program benefit-exclusivity logic, sourced from `applicant_transportation` fields that
  have nothing to do with age/income/residency/documents.
- NYC Care: eligibility turns on `insuranceEligibility` (a three-state result of "a formal
  insurance and affordability screening the engine never infers from income" — the validator's own
  comment) and `canAffordInsurance`, both from `applicant_healthcare`. Neither is an age, income,
  residency, or document-category fact; both are external qualitative determinations.

**Consequence for scoping the next command**: "generic across all programs" is achievable, and the
seeded tables (once the gaps above are addressed) can drive it, for the shared criteria shape that
already covers the bulk of the 97-program catalogue's scorable set. Fair Fares and NYC Care need an
explicit extension point beyond that shared shape — a small number of program-specific predicate
hooks reading `applicant_transportation`/`applicant_healthcare` directly — not a fully generic
"one function, one table shape, zero exceptions" design. Planning the generic engine as "generic
core + named per-program overrides for the minority that need them" avoids rediscovering this
mid-build.

## 5. Proposed build plan for the next command

**Before writing the generic engine**, close two real gaps, in this order:

1. **Fix `basic_eligibility_filters.requires_nyc_residency`** to reflect the real per-program
   signal (`criteria.nycResident === true` for 20 of 97, not the schema default for all 97) — a
   `push-catalogue.mjs` change plus a live `UPDATE`, the same shape of fix as the earlier
   `benefit_programs.code` casing correction. This blocks correctness, not just completeness — do
   it first.
2. **Decide, explicitly, how `partial`/`unchecked`/`sources.*`/`requiredCategories` reach the
   engine** — this is a real design choice, not something to guess past:
   - **Option A** — extend the schema: a `partial BOOLEAN`, `unchecked TEXT[]` on
     `basic_eligibility_filters` (or a new table), a source-citation table keyed by
     `(benefit_program_id, criterion)`, and a `required_categories` join table or array column on
     `benefit_programs`. Fully DB-driven once done; real migration + seeding work first.
   - **Option B** — the generic engine reads these four fields from
     `program-criteria.generated.json`/`programs.runtime.json` directly (bundled into `backend/`,
     the same static files `catalogue.ts` already uses) while reading the numeric criteria
     (age/income) from Postgres. No schema change, but two sources of truth for one program's
     eligibility record, split by field — needs to be a deliberate choice, documented as such, not
     an accident of "whichever was easier to reach."
   - Whichever is chosen, `program.sourceUrl`/`applyUrl`/`agency`/etc. (display/citation fields)
     have the same two options and should be decided together, not separately.

**Then, the engine itself**:

3. Build one generic evaluator in `backend/src/features/eligibility/` — same input/output contract
   as `src/data/eligibility.ts`'s `evaluate()` (it's already proven, tested prior art; port the
   logic, don't redesign it), parameterized by a `benefit_programs.id` (or the lowercase `code`,
   consistent with `program-id-resolver.ts`'s canonical scheme) instead of hardcoded per-program
   files.
4. Keep `idnycValidator`'s shape as the generic path's first real target — it needs no extension
   hook, so it's the cheapest correctness check that the generic engine reproduces the hardcoded
   one exactly.
5. Add the two named extension hooks for Fair Fares (transportation-benefit exclusivity) and NYC
   Care (insurance/affordability), reading `applicant_transportation`/`applicant_healthcare`
   directly — not folded into the generic criteria shape, kept as explicit, documented exceptions.
6. Replace `SUPPORTED_PROGRAM_IDS`-style hardcoded gating in `benefits.controller.ts`/
   `forms.controller.ts` with "does this `benefit_programs` row have a scorable criteria record" —
   the generic equivalent of today's `scorable` check — once step 2's decision gives the engine a
   real source for `scorable`.
7. Verify the same way every step of this project has been verified: a real round trip against the
   live database for at least one program in each category — one that's fully generic (IDNYC-shaped),
   one that needs an extension hook (Fair Fares or NYC Care), and one that's `not_screened`
   (unscorable) — confirming the output status and citations match what `src/data/eligibility.ts`
   would produce for the same inputs today.

This is buildable starting immediately after step 2's decision is made — no further investigation
round needed; the field-by-field gap list above is complete.
