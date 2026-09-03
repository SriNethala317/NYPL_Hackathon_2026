-- ============================================================
-- Migration: client-access RLS policies
--
-- Migration 5 enabled RLS on all 28 tables with zero policies — correct as a default-deny
-- baseline, but it also denies the app itself. This adds real policies scoped to auth.uid() for
-- the five tables the client reads/writes directly (users, applicant_profiles, ocr_extractions,
-- field_provenance, applications), plus public SELECT on the catalog tables (reference data with
-- no owner — programs, form definitions, eligibility rules, income/basic-eligibility filters).
--
-- Every other table (households, employment_records, income_sources, screening_*, audit_logs,
-- addresses, employers, application_status_history, application_snapshots, ...) stays exactly as
-- migration 5 left it: RLS enabled, no policies, fully deny-all. Nothing in this rewrite reads or
-- writes them from the client, so they get no policy here.
-- ============================================================

-- ------------------------------------------------------------
-- Helpers. SECURITY DEFINER so they can read `users`/`applicant_profiles` to resolve the caller's
-- own row without those lookups themselves needing a policy (which would be circular — the
-- policies below call these functions). search_path is pinned to avoid hijacking.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_app_user_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT id FROM users WHERE auth_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION current_applicant_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT id FROM applicant_profiles WHERE user_id = current_app_user_id();
$$;

-- ------------------------------------------------------------
-- users — keyed directly on auth_user_id = auth.uid(). DELETE is required here: deleteMyData()
-- deletes this row directly and relies on ON DELETE CASCADE (confirmed present on every table
-- transitively referencing applicant_profiles) to remove everything beneath it.
-- ------------------------------------------------------------

CREATE POLICY users_select ON users FOR SELECT USING (auth_user_id = auth.uid());
CREATE POLICY users_insert ON users FOR INSERT WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY users_update ON users FOR UPDATE USING (auth_user_id = auth.uid()) WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY users_delete ON users FOR DELETE USING (auth_user_id = auth.uid());

-- ------------------------------------------------------------
-- applicant_profiles — one row per user (UNIQUE user_id). No DELETE policy: rows are removed only
-- via the users-row cascade, never directly by the client.
-- ------------------------------------------------------------

CREATE POLICY applicant_profiles_select ON applicant_profiles FOR SELECT USING (user_id = current_app_user_id());
CREATE POLICY applicant_profiles_insert ON applicant_profiles FOR INSERT WITH CHECK (user_id = current_app_user_id());
CREATE POLICY applicant_profiles_update ON applicant_profiles FOR UPDATE USING (user_id = current_app_user_id()) WITH CHECK (user_id = current_app_user_id());

-- ------------------------------------------------------------
-- ocr_extractions, field_provenance — insert-only from the client (saveDocument never updates or
-- deletes a row once written; see profile-repository.ts). No UPDATE/DELETE policy.
-- ------------------------------------------------------------

CREATE POLICY ocr_extractions_select ON ocr_extractions FOR SELECT USING (applicant_id = current_applicant_id());
CREATE POLICY ocr_extractions_insert ON ocr_extractions FOR INSERT WITH CHECK (applicant_id = current_applicant_id());

CREATE POLICY field_provenance_select ON field_provenance FOR SELECT USING (applicant_id = current_applicant_id());
CREATE POLICY field_provenance_insert ON field_provenance FOR INSERT WITH CHECK (applicant_id = current_applicant_id());

-- ------------------------------------------------------------
-- applications — read today by loadProfile(); insert/update included since "reads/writes
-- directly" names this table and a form flow will write to it soon. No DELETE policy: an
-- application is cancelled via its status, never removed as a row.
-- ------------------------------------------------------------

CREATE POLICY applications_select ON applications FOR SELECT USING (applicant_id = current_applicant_id());
CREATE POLICY applications_insert ON applications FOR INSERT WITH CHECK (applicant_id = current_applicant_id());
CREATE POLICY applications_update ON applications FOR UPDATE USING (applicant_id = current_applicant_id()) WITH CHECK (applicant_id = current_applicant_id());

-- ------------------------------------------------------------
-- Catalog tables — reference data, no owner column, readable by anyone (anon included), writable
-- by no client role. Matches the "public catalogue, RLS-exempt for reads" posture the old schema
-- documented for its own `programs` table.
-- ------------------------------------------------------------

CREATE POLICY benefit_programs_public_read ON benefit_programs FOR SELECT USING (true);
CREATE POLICY form_versions_public_read ON form_versions FOR SELECT USING (true);
CREATE POLICY form_fields_public_read ON form_fields FOR SELECT USING (true);
CREATE POLICY eligibility_rules_public_read ON eligibility_rules FOR SELECT USING (true);
CREATE POLICY income_eligibility_public_read ON income_eligibility FOR SELECT USING (true);
CREATE POLICY income_eligibility_thresholds_public_read ON income_eligibility_thresholds FOR SELECT USING (true);
CREATE POLICY basic_eligibility_filters_public_read ON basic_eligibility_filters FOR SELECT USING (true);
CREATE POLICY basic_eligibility_filter_age_groups_public_read ON basic_eligibility_filter_age_groups FOR SELECT USING (true);
CREATE POLICY screening_enum_values_public_read ON screening_enum_values FOR SELECT USING (true);
