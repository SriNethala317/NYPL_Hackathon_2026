# Legacy schema reference audit

Generated after `20260101000001_base_schema.sql` (and the 3 follow-on migrations) replaced
`0001_initial.sql`. RLS was verified enabled on all 28 tables, anon key confirmed blocked,
service role key confirmed working — see the `verify-rls-and-audit-legacy-refs` command run that
produced this file.

**This is discovery only.** Nothing below has been fixed. Fixing it means rewriting
`profile-repository.ts` against the new schema's actual shape, not a mechanical find-and-replace —
several of the old calls don't just reference a renamed table, they read/write columns that don't
exist on the new schema's tables at all.

## Real schema now (28 tables)

`addresses`, `applicant_healthcare`, `applicant_profiles`, `applicant_transportation`,
`application_snapshots`, `application_status_history`, `applications`, `audit_logs`,
`basic_eligibility_filter_age_groups`, `basic_eligibility_filters`, `benefit_programs`,
`eligibility_rules`, `employers`, `employment_records`, `expenses`, `field_provenance`,
`form_fields`, `form_versions`, `household_members`, `households`, `income_eligibility`,
`income_eligibility_thresholds`, `income_sources`, `ocr_extractions`, `screening_enum_values`,
`screening_person_attributes`, `screening_results`, `users`.

## Affected files

### `src/features/backend/profile-repository.ts` — only file with stale references

The entire module is written against the deleted `0001_initial.sql` schema (`programs`,
`documents`, `field_candidates`, `applications` with the old column shape, and an RPC function
that no longer exists). This is called at runtime, not dead code — `checkBackend()`,
`saveDocument()`, `loadProfile()`, and `deleteMyData()` are the whole read/write surface between
the app and Supabase.

| Line(s) | Stale reference | Likely new-schema target | Notes |
|---|---|---|---|
| 54, 58 | `.from('programs')` | `benefit_programs` | Old `programs` was the public catalogue (matched `src/data/programs.runtime.json`). New `benefit_programs` has a different, smaller shape (`code`, `name`, `description`, `active`) — no `plain_language_name`, `population_served`, `summary`, etc. Catalogue ingestion (`scripts/ingest-programs.mjs` — not yet checked) will need to target this new shape or the columns need adding back. |
| 86, 140 | `.from('documents')` | no direct equivalent — closest is `ocr_extractions` | Old `documents` tracked per-document status (`kind`, `status`, `confidence`, `read_at`) independent of any single field. New `ocr_extractions` is applicant-scoped raw OCR output (`source_type`, `model_name`, `fields` JSONB, `confidence`) — it's a different data model (one extraction run holding many fields as JSON, vs. one row per document with a status lifecycle like `uploading`/`reading`/`needsType`/`failed`). The `document_status`/`document_failure_reason` enums from the old schema (upload-in-progress states) have no analog at all in the new schema. |
| 115, 141 | `.from('field_candidates')` | `field_provenance` | Closer conceptual match than `documents` — both are per-field, per-source records with a confidence score. But column names differ: old `field_key`/`value`/`document_type_id`/`document_id` vs. new `field_key`/`value_text`/`source_type`/`extraction_id`. New table also adds `verified` and `is_canonical` booleans the old one didn't have, and `applicant_id` instead of `user_id` (references `applicant_profiles(id)`, not a bare user id — `profile-repository.ts` would need to resolve or create an `applicant_profiles` row first, which doesn't happen anywhere in this file today). |
| 142, 175–180 | `.from('applications')` reading `program_id`, `reference`, `submitted_at`, `stage` | `applications` (name unchanged) | The table name survived, but none of the 4 columns this code reads exist on the new `applications` table. New shape is `applicant_id`, `benefit_program_id`, `form_version_id`, `status` (enum), `answers` (JSONB), `created_at`, `updated_at`, `submitted_at`. This is not a rename — it's a different table that happens to share a name. Treat it as needing its own migration plan, not a find-and-replace. |
| 199 | `.rpc('delete_my_data')` | — function does not exist | Confirmed via `SELECT proname FROM pg_proc WHERE proname = 'delete_my_data'` — zero rows on the live project. The old migration defined this function (cascading delete scoped to `auth.uid()`); nothing in `database/schema.sql` or the 3 follow-on migrations recreates it. Calling `deleteMyData()` today will error, not silently no-op. |

## Not affected

`grep` across `src/`, `backend/src/`, and `scripts/` for the other 4 old table names
(`program_criteria`, `profile_fields`, `profile_field_state`, `generated_forms`) and for
`field_candidates`/`programs` as bare string literals (JSON data, comments) turned up nothing else
calling `.from(...)` against them — `src/data/*` files that mention "programs" are working with
the static JSON catalogue (`programs.runtime.json`), not the Supabase table, and are unaffected by
this migration.

## Priority

`profile-repository.ts` is the single highest-priority file — it's the entire persistence layer
for the Profile tab (documents, extracted fields, applications) and every exported function in it
will fail against the live database as currently written. `scripts/check-supabase.mjs` (not a
`src/` file, so outside this audit's grep scope, but already observed failing in the prior
session) exercises the same stale `programs` table for its connectivity check.
