# Cleanup report — backend/ dead code, database/ stale files

Run before any deletion; see `known_followups.md` for how this fits the rest of the backlog.

## Part A — backend/, dead code

### Exclusion list (confirmed intentional-but-unused, not touched)

- `src/features/benefits-discovery/adapters/`, `to-benefits-screening-input.ts`,
  `providers/nyc-screening.provider.ts`, `providers/fixture-screening.provider.ts` — real NYC
  Screening API plumbing, deliberately not wired in yet (per the command's own list).
- Searched `src/` for other self-describing "not yet connected" / "prototype" / "credential-gated"
  language to catch anything else that should join this list. Found nothing beyond
  `nyc-screening.provider.ts` itself (already listed) — no other file's own comments claim
  intentional non-use.

### Whole-file zero-reference scan

```
for f in $(find src -name "*.ts" -not -name "*.test.ts"); do
  base=$(basename "$f" .ts)
  refs=$(grep -rl "$base" src tests --include="*.ts" | grep -v "^$f$" | wc -l)
  if [ "$refs" -eq 0 ]; then echo "CANDIDATE: $f"; fi
done
```

Result: 2 candidates, both already on the exclusion list above —

- `src/features/benefits-discovery/providers/fixture-screening.provider.ts`
- `src/features/benefits-discovery/providers/nyc-screening.provider.ts`

Manually confirmed both are genuinely referenced by nothing else (not even indirectly through an
`index.ts` re-export) — grep for the class names `NycScreeningProvider`/`FixtureScreeningProvider`
returns only the files' own definitions. Checked all three `index.ts` barrel files
(`benefits-discovery`, `eligibility`, `form-payload`) for re-exports that the basename scan might
miss: none re-export either provider.

**Conclusion: zero genuine dead-file candidates in `backend/src`.** Everything the scan surfaced
was already known-and-intentional.

### Within-file dead code — linter

No backend-specific ESLint config exists (`backend/` has no `.eslintrc*`/`eslint.config.*`), so
`npx eslint` resolves the repo-root Expo config (`eslint.config.js`, `eslint-config-expo/flat`) by
walking up from `backend/`. That config *does* parse backend's plain TS correctly and *does* have
`@typescript-eslint/no-unused-vars` enabled — verified empirically by dropping a throwaway file
with a deliberately-unused function and variable into `src/` and confirming the linter flagged
both before deleting the probe file.

```
cd backend && npx eslint src --ext .ts
```

Result: 4 warnings, all `@typescript-eslint/array-type` (style: `Array<T>` vs `T[]`), 0 errors, 0
unused-vars/unused-import findings:

- `src/features/benefits-discovery/providers/gemini-benefit-explanation.provider.ts:110`
- `src/features/benefits-discovery/providers/gemini-model-resolver.ts:45`
- `src/features/benefits-discovery/providers/nyc-benefits-catalog.provider.ts:5`

These are style warnings, not dead code, and out of scope for this command — not touched.

**Conclusion: no within-file dead code detected.**

## Part B — database/, stale/superseded files

### Confirmed candidate: `database/migrations/`

```
grep -rln "database/migrations" --include="*.ts" --include="*.js" --include="*.mjs" . --exclude-dir=node_modules
```

Result: no matches anywhere in the repo. Confirmed still true, per the earlier session's finding.

Contents (3 files, all untracked — never committed):

- `screening_api_migration (1).sql` (125 lines) — byte-for-byte identical to
  `supabase/migrations/20260101000002_screening_api_migration.sql`, the version actually applied.
- `screening_api_migration (2).sql` (159 lines) — an earlier, longer draft.
- `screening_api_migration (3).sql` (28 lines) — an earlier, shorter fragment.

The `(1)`/`(2)`/`(3)` naming is consistent with sequential browser-downloaded drafts of the same
migration, superseded once it was finalized into `supabase/migrations/` — which is what Supabase
actually tracks and applies. Zero references anywhere, folder is a deletion candidate.

### Protected, not candidates (even though `known_followups.md` summarizes their conclusions)

Left untouched, per the command's explicit instruction that a summary doesn't carry the original
evidence:

- `legacy_reference_audit.md`
- `form_versions_investigation.md`
- `validation_and_gemini_alignment_audit.md`
- `pdf_filling_connection_investigation.md`
- `generic_eligibility_engine_scoping.md`
- `mock_user_journey_report.md`
- `schema.sql`

### Possible duplicates flagged for manual review

Checked all 7 `.md` files in `database/` for genuine word-for-word or near-duplicate content (not
just "covers similar ground"): compared line counts and opening sections. **None found** — every
file covers a distinct investigation with a distinct opening statement of scope. No action needed;
nothing flagged.

### Not evaluated (outside this command's defined scope)

`backend/test-form-payload.ts` and `backend/tests/integration/test-form-payload.ts` are both
untracked, and diff meaningfully (different `BASE_URL` port, different profile-payload wrapping,
the root one filters by `formAutomationSupported` and the `tests/integration/` one doesn't) — the
`tests/integration/` copy looks like an earlier draft of the root one. Neither file matched this
command's defined methodology (the zero-reference scan was scoped to `src/`, not ad-hoc root/test
scripts), and deleting either without being asked risks discarding in-progress verification work.
Flagged here for the user's own judgment, not touched.

## Deletion plan (Part 8)

- `backend/`: nothing — zero genuine dead-file candidates survived triage.
- `database/`: `database/migrations/` only (3 files, confirmed zero references, untracked so
  deletion is not reversible via `git revert` — noting this before deleting).
