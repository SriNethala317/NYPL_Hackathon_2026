-- ============================================================
-- Migration: NYC Benefits Screening API compliance
-- Adds the fields needed to build a valid /eligibilityPrograms
-- request from stored data, and to store/audit the response.
-- Additive only — does not touch existing tables' existing columns.
-- ============================================================

-- ------------------------------------------------------------
-- 1. HOUSEHOLD-LEVEL fields the API's `household[]` object needs
--    that we don't currently capture.
-- ------------------------------------------------------------

ALTER TABLE households
    ADD COLUMN cash_on_hand              NUMERIC(12,2),
    ADD COLUMN living_rental_type        VARCHAR(30),   -- e.g. RentControlled — see note on enums below
    ADD COLUMN living_renting            BOOLEAN,
    ADD COLUMN living_owner              BOOLEAN,
    ADD COLUMN living_staying_with_friend BOOLEAN,
    ADD COLUMN living_hotel              BOOLEAN,
    ADD COLUMN living_shelter            BOOLEAN,
    ADD COLUMN living_prefer_not_to_say  BOOLEAN NOT NULL DEFAULT FALSE;

-- ------------------------------------------------------------
-- 2. PER-PERSON fields the API's `person[]` object needs.
--    A "person" in the API is either the primary applicant or a
--    household member — so this table attaches to exactly one of
--    applicant_profiles or household_members, never both.
--    These are genuinely reusable facts about the person (not
--    tied to a single benefit application), so they follow the
--    same "don't ask twice" principle as everything else — ask
--    once, reuse on every future screening call.
-- ------------------------------------------------------------

CREATE TABLE screening_person_attributes (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id                    UUID REFERENCES applicant_profiles(id) ON DELETE CASCADE,
    household_member_id             UUID REFERENCES household_members(id) ON DELETE CASCADE,
    student                         BOOLEAN NOT NULL DEFAULT FALSE,
    student_fulltime                BOOLEAN NOT NULL DEFAULT FALSE,
    pregnant                        BOOLEAN NOT NULL DEFAULT FALSE,
    unemployed                      BOOLEAN NOT NULL DEFAULT FALSE,
    unemployed_worked_last_18_months BOOLEAN NOT NULL DEFAULT FALSE,
    blind                           BOOLEAN NOT NULL DEFAULT FALSE,
    disabled                        BOOLEAN NOT NULL DEFAULT FALSE,
    veteran                         BOOLEAN NOT NULL DEFAULT FALSE,
    benefits_medicaid                BOOLEAN NOT NULL DEFAULT FALSE,
    benefits_medicaid_disability     BOOLEAN NOT NULL DEFAULT FALSE,
    household_member_type           VARCHAR(30),        -- e.g. HeadOfHousehold — see note on enums below
    living_owner_on_deed            BOOLEAN NOT NULL DEFAULT FALSE,
    living_rental_on_lease          BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT screening_person_exactly_one_owner CHECK (
        (applicant_id IS NOT NULL AND household_member_id IS NULL) OR
        (applicant_id IS NULL AND household_member_id IS NOT NULL)
    ),
    CONSTRAINT screening_person_unique_applicant UNIQUE (applicant_id),
    CONSTRAINT screening_person_unique_member UNIQUE (household_member_id)
);

-- ------------------------------------------------------------
-- 3. PER-PERSON incomes and expenses.
--    Extends what income_sources already covers (which was tied
--    only to the primary applicant) so every household member can
--    have their own incomes/expenses, matching the API's per-person
--    incomes[]/expenses[] arrays.
-- ------------------------------------------------------------

ALTER TABLE income_sources
    ADD COLUMN screening_person_id UUID REFERENCES screening_person_attributes(id) ON DELETE CASCADE,
    ADD COLUMN api_frequency VARCHAR(20);  -- Weekly/Biweekly/Monthly/Annual — see note on enums below

CREATE TABLE expenses (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    screening_person_id UUID NOT NULL REFERENCES screening_person_attributes(id) ON DELETE CASCADE,
    amount              NUMERIC(12,2) NOT NULL,
    expense_type        VARCHAR(50) NOT NULL,   -- e.g. Medical — see note on enums below
    frequency           VARCHAR(20) NOT NULL,   -- e.g. Weekly — see note on enums below
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_screening_person ON expenses(screening_person_id);

-- ------------------------------------------------------------
-- 4. Store every screening call made — request sent, response
--    received, when. Both payloads are external-owned shapes
--    (the API defines them, not us), so JSONB is the right fit
--    here, same reasoning as ocr_extractions.fields.
-- ------------------------------------------------------------

CREATE TABLE screening_results (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id        UUID NOT NULL REFERENCES applicant_profiles(id) ON DELETE CASCADE,
    request_payload     JSONB NOT NULL,   -- exact array sent to POST /eligibilityPrograms
    response_payload    JSONB NOT NULL,   -- exact { type, eligiblePrograms[] } response
    api_environment     VARCHAR(20) NOT NULL DEFAULT 'sandbox'
                            CHECK (api_environment IN ('sandbox', 'production')),
    screened_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_screening_results_applicant ON screening_results(applicant_id, screened_at DESC);

-- ------------------------------------------------------------
-- 5. Enum reference table.
--
--    IMPORTANT: the public docs only show EXAMPLE values for several
--    of the API's enum-like fields — livingRentalType ("RentControlled"),
--    income/expense `type` ("Veteran", "Medical"), `frequency`
--    ("Monthly", "Weekly"), and householdMemberType ("HeadOfHousehold").
--    The full, authoritative list of accepted values is only in the
--    account-gated docs (Endpoints / Eligibility Guidelines pages).
--
--    Rather than guess a CHECK constraint and risk rejecting valid
--    API values (or silently accepting invalid ones), store these
--    as free VARCHAR now and populate this lookup table once you
--    have API account access — then swap the VARCHAR columns above
--    to REFERENCES screening_enum_values(value) via foreign key.
-- ------------------------------------------------------------

CREATE TABLE screening_enum_values (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    field_name  VARCHAR(50) NOT NULL,   -- e.g. 'livingRentalType', 'incomeType', 'frequency', 'householdMemberType'
    value       VARCHAR(50) NOT NULL,   -- e.g. 'RentControlled'
    UNIQUE (field_name, value)
);
