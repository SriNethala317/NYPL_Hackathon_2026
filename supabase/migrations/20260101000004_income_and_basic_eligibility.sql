-- ============================================================
-- Migration: income_eligibility and basic_eligibility_filters
--
-- Gives the Postgres schema parity with what was designed for
-- MongoDB but never ported: structured income cutoffs
-- (hand-extracted from the Open Data dataset's prose, since it's
-- not machine-comparable as-is) and the Phase 1 quick-screen
-- filters (age bucket, income test presence, NYC residency,
-- student targeting, immigration requirement).
--
-- Both are 1:1 with benefit_programs, following the same pattern
-- as applicant_healthcare / applicant_transportation. The two
-- array-shaped fields (income thresholds by household size, and
-- age groups) each get their own child table, since Postgres
-- doesn't nest arrays inside a row the way MongoDB nests them
-- inside a document.
-- ============================================================

-- ------------------------------------------------------------
-- income_eligibility — one row per program. Manually extracted
-- from plain_language_eligibility HTML prose, not synced
-- automatically. extracted_from and last_verified_at mark this
-- as needing periodic human re-verification, since these dollar
-- figures change yearly.
-- ------------------------------------------------------------
CREATE TABLE income_eligibility (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    benefit_program_id UUID NOT NULL UNIQUE REFERENCES benefit_programs(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('by_household_size', 'flat_limit', 'not_income_based')),

    -- used when type = 'flat_limit', e.g. STAR, DRIE, SCHE
    flat_annual_limit NUMERIC,

    -- used when type = 'by_household_size', e.g. Head Start, Section 8 — extrapolates past the largest listed size
    additional_person_annual_increment NUMERIC,

    extracted_from VARCHAR(50) NOT NULL DEFAULT 'plain_language_eligibility',
    last_verified_at TIMESTAMPTZ,

    CHECK (
        (type = 'flat_limit' AND flat_annual_limit IS NOT NULL) OR
        (type = 'by_household_size') OR
        (type = 'not_income_based')
    )
);

-- ------------------------------------------------------------
-- income_eligibility_thresholds — the by-household-size ladder.
-- One row per (program, household_size). Only populated when
-- income_eligibility.type = 'by_household_size'.
-- ------------------------------------------------------------
CREATE TABLE income_eligibility_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    income_eligibility_id UUID NOT NULL REFERENCES income_eligibility(id) ON DELETE CASCADE,
    household_size INT NOT NULL CHECK (household_size >= 1),
    annual_income_limit NUMERIC NOT NULL,
    UNIQUE (income_eligibility_id, household_size)
);

CREATE INDEX idx_income_eligibility_program_id ON income_eligibility(benefit_program_id);
CREATE INDEX idx_income_eligibility_last_verified ON income_eligibility(last_verified_at); -- find stale thresholds needing re-verification
CREATE INDEX idx_income_thresholds_eligibility_id ON income_eligibility_thresholds(income_eligibility_id);


-- ------------------------------------------------------------
-- basic_eligibility_filters — one row per program. Supports the
-- lightweight Phase 1 self-screen (5 quick questions, answered
-- in-session, never persisted for the applicant — see
-- Eazy_Enrol_Full_Schema_Documentation.md). derived fields
-- (has_income_test, targets_students) are computed from other
-- tables, so last_computed_at marks when that derivation last ran.
-- ------------------------------------------------------------
CREATE TABLE basic_eligibility_filters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    benefit_program_id UUID NOT NULL UNIQUE REFERENCES benefit_programs(id) ON DELETE CASCADE,

    has_income_test BOOLEAN NOT NULL DEFAULT FALSE,        -- true only where income_eligibility is populated
    requires_nyc_residency BOOLEAN NOT NULL DEFAULT TRUE,   -- true for the vast majority; false for state/federal-wide programs
    targets_students BOOLEAN NOT NULL DEFAULT FALSE,        -- derived from population_served containing "Students"

    -- Conservative by design: defaults to NOT_SPECIFIED rather than
    -- assuming eligibility, so the app never overclaims. Populated by
    -- a human reading each program's actual eligibility text — never
    -- inferred from a visa category alone.
    immigration_requirement VARCHAR(30) NOT NULL DEFAULT 'NOT_SPECIFIED' CHECK (
        immigration_requirement IN (
            'OPEN_REGARDLESS_OF_STATUS',
            'CITIZEN_OR_QUALIFIED_ALIEN',
            'STATUS_DEPENDENT',
            'NOT_SPECIFIED'
        )
    ),

    last_computed_at TIMESTAMPTZ
);

-- ------------------------------------------------------------
-- basic_eligibility_filter_age_groups — the age_group list.
-- One row per (program, age_group). Parsed from
-- openDataContent's age_group field, e.g. "Baby", "Toddler",
-- "Older Adults", "Everyone".
-- ------------------------------------------------------------
CREATE TABLE basic_eligibility_filter_age_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    basic_eligibility_filter_id UUID NOT NULL REFERENCES basic_eligibility_filters(id) ON DELETE CASCADE,
    age_group VARCHAR(50) NOT NULL,
    UNIQUE (basic_eligibility_filter_id, age_group)
);

CREATE INDEX idx_basic_filters_program_id ON basic_eligibility_filters(benefit_program_id);
CREATE INDEX idx_basic_filters_nyc_residency ON basic_eligibility_filters(requires_nyc_residency);
CREATE INDEX idx_basic_filters_immigration ON basic_eligibility_filters(immigration_requirement);
CREATE INDEX idx_age_groups_filter_id ON basic_eligibility_filter_age_groups(basic_eligibility_filter_id);


-- ============================================================
-- Example seed data — real numbers for the 5 programs pulled
-- from the live dataset earlier. Uncomment and adjust the
-- subqueries to match your actual benefit_programs.code values.
-- ============================================================
/*
-- Head Start / Early Head Start — by household size
WITH prog AS (
    INSERT INTO income_eligibility (benefit_program_id, type, additional_person_annual_increment, last_verified_at)
    SELECT id, 'by_household_size', 5680, '2026-08-27'
    FROM benefit_programs WHERE code = 'S2R008'
    RETURNING id
)
INSERT INTO income_eligibility_thresholds (income_eligibility_id, household_size, annual_income_limit)
SELECT id, size, limit_val FROM prog, (VALUES
    (2, 21640), (3, 27320), (4, 33000), (5, 38680),
    (6, 44360), (7, 50040), (8, 55720)
) AS t(size, limit_val);

-- Section 8 / Housing Choice Voucher — by household size
WITH prog AS (
    INSERT INTO income_eligibility (benefit_program_id, type, last_verified_at)
    SELECT id, 'by_household_size', '2026-08-27'
    FROM benefit_programs WHERE code = 'S2R013'
    RETURNING id
)
INSERT INTO income_eligibility_thresholds (income_eligibility_id, household_size, annual_income_limit)
SELECT id, size, limit_val FROM prog, (VALUES
    (1, 59400), (2, 67850), (3, 76350), (4, 84800),
    (5, 91600), (6, 98400), (7, 105200), (8, 111950)
) AS t(size, limit_val);

-- Senior Citizen Homeowners' Exemption (SCHE) — flat limit
INSERT INTO income_eligibility (benefit_program_id, type, flat_annual_limit, last_verified_at)
SELECT id, 'flat_limit', 58399, '2026-08-27' FROM benefit_programs WHERE code = 'S2R014';

-- Disability Rent Increase Exemption (DRIE) — flat limit
INSERT INTO income_eligibility (benefit_program_id, type, flat_annual_limit, last_verified_at)
SELECT id, 'flat_limit', 50000, '2026-08-27' FROM benefit_programs WHERE code = 'S2R005';

-- School Tax Relief (STAR), Basic tier — flat limit
INSERT INTO income_eligibility (benefit_program_id, type, flat_annual_limit, last_verified_at)
SELECT id, 'flat_limit', 500000, '2026-08-27' FROM benefit_programs WHERE code = 'S2R012';
*/
