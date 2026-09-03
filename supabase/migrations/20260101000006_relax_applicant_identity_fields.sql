-- ============================================================
-- Migration: relax applicant identity fields for anonymous-first bootstrap
--
-- applicant_profiles.{first_name,last_name,date_of_birth,primary_phone,email} were created
-- NOT NULL, but the product asks nothing up front — see ensureSession() in
-- src/features/backend/auth.ts: the default is an anonymous Supabase Auth session with no name,
-- DOB, phone, or email collected at sign-in. These fields are populated later, one at a time, as
-- documents are read and saveDocument() writes what they yielded.
--
-- users.email is also NOT NULL UNIQUE as written, which blocks the anonymous path one step
-- earlier than applicant_profiles does: a Supabase anonymous auth session has no email at all
-- (auth.users.email is null, is_anonymous is true), so bootstrapping this app's own `users` row
-- for that session can never satisfy NOT NULL. Relaxing it to nullable is safe — Postgres UNIQUE
-- treats every NULL as distinct, so any number of anonymous users can each have a null email with
-- no collision.
-- ============================================================

ALTER TABLE applicant_profiles ALTER COLUMN first_name DROP NOT NULL;
ALTER TABLE applicant_profiles ALTER COLUMN last_name DROP NOT NULL;
ALTER TABLE applicant_profiles ALTER COLUMN date_of_birth DROP NOT NULL;
ALTER TABLE applicant_profiles ALTER COLUMN primary_phone DROP NOT NULL;
ALTER TABLE applicant_profiles ALTER COLUMN email DROP NOT NULL;

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
