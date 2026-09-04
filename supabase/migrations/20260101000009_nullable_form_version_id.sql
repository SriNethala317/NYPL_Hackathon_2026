-- ============================================================
-- Migration: nullable applications.form_version_id
--
-- Option 1 from database/form_versions_investigation.md, chosen: the backend's real
-- form-payload generation (backend/src/features/form-payload/) reads exclusively from
-- hardcoded TypeScript configs (mappings.ts + config/*.mapping.ts) -- confirmed by grep,
-- zero references anywhere to form_versions/form_fields. Those two tables have zero rows
-- and no client write path, so a NOT NULL FK onto form_versions(id) made every real
-- applications insert impossible without first fabricating a form_versions row by hand
-- (exactly what the mock end-to-end run had to do with the service-role key to even test
-- this table).
--
-- form_versions/form_fields are left in place, unpopulated -- not dropped. That is a
-- separate, larger decision (see the investigation doc's options 2/3) this migration does
-- not make.
-- ============================================================

ALTER TABLE applications ALTER COLUMN form_version_id DROP NOT NULL;
