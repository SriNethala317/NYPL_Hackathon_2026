# `form_versions` / `form_fields` investigation

Discovery only, per this command's scope. Nothing below has been implemented — this lays out the
tradeoffs of three real options for a human to choose from, the same way the `reference`-field
question was left open in an earlier report rather than guessed.

## What actually generates a form payload today

Read `backend/src/features/form-payload/generate-form-payload.ts`, `types.ts`, and all three
`config/*.mapping.ts` files (`fair-fares.mapping.ts`, `idnyc.mapping.ts`, `nyc-care.mapping.ts`) in
full.

**Confirmed: the backend's actual payload-generation logic reads from these TypeScript configs
entirely, with no reference anywhere to `form_versions` or `form_fields`.** Grepped both
`backend/src` and `src` for `form_versions`, `form_fields`, `FormVersion`, `FormField` — the only
hits are this app's own unrelated `FormFieldValue`/`FormFieldPrimitive` TypeScript types (in
`form-payload/types.ts`) and `src/features/documents/idnyc-form-fields.ts` (a completely separate
system: PDF AcroForm field positions for filling the actual IDNYC PDF with `pdf-lib`, nothing to do
with the Postgres schema). Zero references to the database tables from any code that runs.

The real mechanism, concretely:

- `mappings.ts` is a hardcoded `Record<string, ProgramFormMapping>` with exactly 3 entries
  (`fair_fares`, `idnyc`, `nyc_care`), each importing one static `config/*.mapping.ts` object.
- Each mapping is `{ programId, fields: Record<string, string> }` — e.g. IDNYC's maps
  `first_name -> 'identity.firstName'`, `zip_code -> 'residence.zipCode'`, etc. Nine fields for
  Fair Fares, nine for IDNYC, eleven for NYC Care.
- `generate-form-payload.ts`'s `readProfileValue()` is a second hardcoded structure: a `switch`
  statement naming all 14 dotted `MockUserProfile` paths this app knows how to read (`identity.
  firstName`, `household.annualIncome`, `transportation.receivesFullCarfare`, etc.). This is not
  driven by any config either — adding a new source path means editing this switch.
- Nothing about *which form version is active*, when it became effective, or ordering/labeling of
  fields is modeled anywhere in this system. There is exactly one mapping per program, forever;
  `readyForPreview` and `missingFields` are computed from `eligibilityResult.missingFields` plus
  whichever mapped fields come back empty, not from a `required` flag on anything.

## What `form_versions`/`form_fields` were designed to hold, and the real gap between the two models

From `database/schema.sql`'s "BENEFIT PROGRAMS / DYNAMIC FORMS" section:

- `form_versions(id, benefit_program_id, version_number, effective_from, effective_to)` — a
  program can have several form versions over time, each with a validity window.
- `form_fields(id, form_version_id, field_key, label, data_type, required, section,
  display_order)` — per-field metadata: a human-readable `label`, a `data_type` enum (`text`,
  `integer`, `currency`, `date`, `boolean`, `object`, `enum`), a `required` boolean, a `section`
  grouping, and `display_order`.

This is not just "the same mapping data, stored differently." The TS configs carry **less**
information than `form_fields` was built to hold — no `label`, no `data_type`, no explicit
`required` flag, no `section`, no `display_order` exist anywhere in the TS side today. And the TS
configs carry information `form_fields` has no column for at all — the *source path* into the
applicant's profile (`'identity.firstName'`) isn't a concept `form_fields` models; it only
describes the field as it appears on the form, not where its value comes from. Populating
`form_fields` from the TS configs would mean inventing labels/data types/sections that don't exist
in code today, and populating `form_versions`/`form_fields` would still leave the *source-mapping*
half of the problem (which this app actually depends on to fill anything) unaddressed, since
nothing in the schema models "where does this field's value come from."

## Three real options — not picked, for the user to decide

**Option 1 — make `applications.form_version_id` nullable.**
Simplest change (one `ALTER TABLE`), matches what's actually implemented: the backend doesn't use
a table-driven form system at all, so requiring a row to reference is requiring something that
serves no purpose today. Cost: leaves two competing "what does this program's form look like"
answers sitting in the schema unused — `form_versions`/`form_fields` (empty, unreferenced) and the
TS configs (real, working) — which is a standing source of confusion for the next person who reads
the schema and reasonably assumes it's the live one. Doesn't remove the tables, so the confusion
persists indefinitely unless someone later also does option 2.

**Option 2 — drop `form_versions`/`form_fields` from the schema entirely.**
Cleanest end state: one source of truth (the TS configs), no dead tables, no FK to something that
will never be populated by current code. Cost: a real schema migration (`DROP TABLE`), which is
exactly the kind of change that needs the user's explicit sign-off rather than a script deciding
unilaterally — it's irreversible without a backup, and it forecloses ever going the "queryable
form definitions" direction (option 3) without redoing this work. Also requires deciding what
`applications.form_version_id` becomes instead (drop the column too, or repoint it — a second
decision bundled into this one).

**Option 3 — actually populate `form_versions`/`form_fields` from the TS configs, one-time or
ongoing sync.**
Only worth doing if something genuinely needs to query form structure without a TypeScript
deploy — e.g., an admin tool that lists what a program's form asks for, or a future non-TS client.
Cost is the highest of the three: as shown above, this isn't a mechanical transcription — `label`,
`data_type`, `required`, `section`, and `display_order` would all need to be authored by hand for
every field of all 3 (eventually more) programs, since none of that metadata exists in the TS
configs to copy. And a sync step would need to be built and kept running, or the two sources drift
apart immediately after the one-time copy — the same "two sources of truth" cost as option 1, just
with more data duplicated into the stale side. Worth it only if there's a real, current need for
form structure to be queryable outside a TypeScript deploy; nothing in this repo demonstrates that
need today (no `Application_Filling_Guide.md` or similar exists in the repo to check against — it
was named in a previous command's out-of-scope note but isn't actually present here).

## Not decided here

Which of the three to take is a product/architecture decision, not something to infer from the
code. Flagging back to the user, the same way the earlier `benefit_programs.code` semantics
question was surfaced rather than guessed.
