# Does `generate-form-payload.ts`'s output actually reach a PDF-filling step?

Discovery only, per this command's scope. Nothing built or fixed here.

## Short answer

**Yes, for exactly one program (IDNYC), through a real, tested, currently-passing pipeline — but
that pipeline is not reachable from anywhere a real user or the live backend routes would trigger
it, and it fills a PDF copy the codebase's own comments say is already stale.** For the other two
programs `generate-form-payload.ts` supports (Fair Fares, NYC Care), there is no PDF-filling
counterpart anywhere — its output has nowhere to go. Separately, the mobile app has its own,
completely different, actually-live PDF-filling path for IDNYC (plus two other programs) that
never touches `generate-form-payload.ts` at all. Three systems, one real (but dormant) bridge
between two of them.

## 1. The PDF-filling system(s) — there are two, not one

```
$ grep -rln "pdf-lib|pdfkit|PDFDocument|AcroForm|fillForm" --include="*.ts" --include="*.js" . --exclude-dir=node_modules
./metro.config.js
./src/features/documents/fill-idnyc-form.ts
./src/features/documents/idnyc-form-fields.ts
./src/features/documents/idnyc-form-requirements.ts
./src/features/forms/fill-form.test.ts
./src/features/forms/fill-form.ts
./src/features/forms/index.ts
./src/features/forms/templates.ts
./src/i18n/strings.ts
./tests/integration/idnyc-form-fill.integration.ts
```

**System A — `src/features/forms/` (`fill-form.ts` + `templates.ts`).** This is the one wired into
the actual, live mobile app screen (`src/app/form/[id].tsx`, reached from `program/[id].tsx`'s
"Fill this form" button via `hasTemplate(id)`). It fetches the **current, live** PDF straight from
the City's own URL at runtime (`fetchTemplate()`), fills it with `pdf-lib` using the app's own
locally-reconciled `values` (the 5-key `ProfileFieldKey` shape — `fullName`/`dob`/`address`/
`household`/`income`), and covers exactly 3 of the 97 catalogue programs: DRIE (`P005en`), SCRIE
(`P015en`), and IDNYC (`P032en`). Its own module comment states every `pdfField` name was read off
the real, current PDF by hand with `scripts/inspect-form.mjs` — "never guessing."

**System B — `src/features/documents/` (`fill-idnyc-form.ts`, `idnyc-form-fields.ts`,
`idnyc-form-requirements.ts`, `adapters/idnyc-form-payload.adapter.ts`).** IDNYC-only. Fills a
**locally-committed copy** of the form, `Forms/IDNYCForm.pdf` (821,830 bytes, present in the repo).
`templates.ts`'s own comment (System A's file) already flags this exact copy as suspect: *"A
sibling branch had already built an IDNYC filler against a copy of the form committed to the
repo. That copy is not the form the City serves today — its bytes match neither the current
English application nor the 10-to-13 version."* This system's PDF field names are bare numbers
(`'1'` through `'32'`, decoded offline with `pymupdf`/`pypdf` since the PDF carries no semantic
field labels at all) — confirmed by reading `idnyc-form-fields.ts` directly.

**Is either invoked from anywhere real?** System A: yes — a real screen, a real button, reachable
by an actual user. System B: **no**. Grepped every caller of its two entry points
(`toIdNycAutomationInput`, `fillIdNycForm`) across the whole repo — the only caller anywhere is
`tests/integration/idnyc-form-fill.integration.ts`, a standalone script. It does have real npm
script names in `backend/package.json` (`test:idnyc:integration`, `test:idnyc:mock`,
`test:idnyc:complete` — all three aliases for the same file), so it's a maintained integration
test, not abandoned code — but nothing in the live mobile app or the live `backend/` Express routes
calls it. Same dormant-but-real-and-tested pattern found repeatedly elsewhere in this project.

## 2. Real field names vs. the payload's output keys — completely different, by design

`generate-form-payload.ts`'s actual output keys (confirmed from `IDNYC_FORM_MAPPING`, the mapping
config `generateFormPayload('idnyc', ...)` uses): `first_name`, `last_name`, `date_of_birth`,
`street_address`, `city`, `state`, `zip_code`, `email`, `phone` — plain, semantic, hand-chosen
snake_case.

The real PDF's own field names (System B, `Forms/IDNYCForm.pdf`, read via pdf-lib/pymupdf):
`'1'`, `'2'`, ... `'32'` — bare widget numbers with zero semantic meaning, mapped to labels only by
a hand-built lookup table (`IdNycFormField.firstName = '7'`, etc.) built by inspecting each
widget's position against the surrounding page text. This is the same shape of mismatch the task
named as an example (an IRS/agency-style opaque field name vs. a payload's plain key) — confirmed
real, not hypothetical, and about as extreme a case as that example describes.

**These do not match, and are not expected to** — `generate-form-payload.ts` was never written
with knowledge of any specific PDF's field names, by design (it's the same reusable
`config/*.mapping.ts` pattern used for all 3 backend-known programs).

## 3. Does anything actually bridge them? Yes — a real, working adapter, for IDNYC only

```
$ grep -rln "generateFormPayload|generate-form-payload" --include="*.ts" . --exclude-dir=node_modules
./backend/src/controllers/forms.controller.ts
./backend/src/features/form-payload/generate-form-payload.ts
./backend/src/features/form-payload/index.ts
./backend/src/routes/forms.routes.ts
./backend/tests/form-payload/form-payload.scenarios.ts
./backend/tests/integration/end-to-end.scenario.ts
./backend/tests/integration/mock-workflow.test.ts
./tests/integration/idnyc-form-fill.integration.ts
```

Cross-referencing against step 1's list: **one file appears in both** —
`tests/integration/idnyc-form-fill.integration.ts`. Read in full. It runs the real, complete chain:

```
checkEligibility(profile)                                    -- backend, generic engine
  -> generateFormPayload(profile, 'idnyc', eligibilityResult) -- backend, semantic snake_case keys
  -> toIdNycAutomationInput(payload, supplementalInput)       -- src/features/documents adapter
  -> fillIdNycForm(templateBytes, profile, options)           -- System B, bare numeric PDF fields
```

`idnyc-form-payload.adapter.ts` is the actual translation layer: it reads
`payload.fields.first_name.value` (backend's semantic key), requires it `confirmed: true` and
non-empty (`requireConfirmedText()`), and re-shapes all 8 required fields plus form-specific
supplemental answers (eye color, height, borough, emergency contact — none of which
`generate-form-payload.ts` has any concept of at all) into the `Profile` shape System B's filler
expects, which then maps to the bare numeric fields via `IdNycFormField`.

**Ran it for real** (`npx tsx tests/integration/idnyc-form-fill.integration.ts`) rather than
assuming it still works:

```
STEP 9 - FILL IDNYC PDF
Status: PASS
{ "generatedBytes": 830797 }

STEP 10 - VERIFY FILLED FIELDS
First Name: expected Demo; actual Demo
Last Name: expected Student; actual Student
Birth Month: expected 09; actual 09
...(19 fields, every one an exact match)...

FINAL RESULT: PASS
Saved PDF: C:\z-Local-Disk-D\Hackathon\NYPL_Hackathon_2026\test-output\idnyc-filled-complete-mock.pdf
[exited with code 0]
```

Real, current, passing — not stale documentation of something that used to work.

**For Fair Fares and NYC Care**, the other two programs `generateFormPayload()` supports: no
adapter, no System-B-equivalent, no System-A template entry either (`formTemplates` only has DRIE/
SCRIE/IDNYC). Their payload output has no PDF-filling destination anywhere in this codebase.

## What a translation layer needs to do — already demonstrated, not hypothetical

For any *new* program, the pattern `idnyc-form-payload.adapter.ts` establishes is the template to
follow: read `generateFormPayload()`'s semantic keys, validate each is `confirmed` and non-empty
(a form must not print an unconfirmed value), collect whatever form-specific fields the payload has
no concept of via a separate supplemental-answers type (`IdNycSupplementalInput`), and produce
whatever intermediate shape the target PDF filler expects — then a `field-name-constants` file
(`idnyc-form-fields.ts`'s pattern) mapping that intermediate shape to the real PDF's own field
identifiers, however opaque. One such pair per program/form, mirroring the existing
`config/*.mapping.ts` per-program convention on the payload side.

## Summary, in order of how serious each gap is

1. **Real and working, but unreachable**: the IDNYC payload → PDF pipeline (System B) is fully
   built, tested, and passing right now — but nothing in the live app or live backend routes calls
   it. Wiring it in is "add a route/screen that calls two already-working functions," not new
   engineering.
2. **Targets a stale PDF**: System B fills a locally-committed copy of the IDNYC form that this
   codebase's own comments already say doesn't match what the City serves today. Fixing this means
   either re-deriving `idnyc-form-fields.ts` against the current PDF, or retiring System B in favor
   of System A (which already fetches the live PDF) — a real decision, not made here.
3. **Two competing, unreconciled IDNYC implementations**: System A (live, reachable, app's own
   local profile, current PDF) and System B (dormant, tested, backend's payload, stale PDF) both
   exist for the same program. Nothing decides which one is authoritative.
4. **No bridge exists at all for Fair Fares or NYC Care**: not a mismatch to fix, an absence — the
   payload has nowhere to go for either program.
