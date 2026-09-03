-- ============================================================
-- NYC Benefits Platform — PostgreSQL Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. ACCOUNT / AUTH
-- ============================================================

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id    UUID NOT NULL UNIQUE,          -- links to Supabase Auth (or other provider)
    username        VARCHAR(50) UNIQUE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE','SUSPENDED','DELETED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. REUSABLE ADDRESS ENTITY (residence, mailing, employer)
-- ============================================================

CREATE TABLE addresses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    street_address  VARCHAR(255) NOT NULL,
    unit_number     VARCHAR(50),
    city            VARCHAR(100) NOT NULL,
    borough         VARCHAR(50),
    state           CHAR(2) NOT NULL DEFAULT 'NY',
    zip_code        VARCHAR(10) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. CANONICAL APPLICANT PROFILE
-- ============================================================

CREATE TABLE applicant_profiles (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL UNIQUE
                                    REFERENCES users(id) ON DELETE CASCADE,
    first_name                  VARCHAR(100) NOT NULL,
    middle_name                 VARCHAR(100),
    last_name                   VARCHAR(100) NOT NULL,
    suffix                      VARCHAR(20),
    date_of_birth               DATE NOT NULL,
    gender_marker               CHAR(1) CHECK (gender_marker IN ('M','F','X')),
    ssn_encrypted               BYTEA,              -- pgcrypto pgp_sym_encrypt()
    passport_number_encrypted   BYTEA,              -- pgcrypto pgp_sym_encrypt()
    nys_client_id               VARCHAR(20),
    primary_phone               VARCHAR(20) NOT NULL,
    email                       VARCHAR(255) NOT NULL,
    residence_address_id        UUID REFERENCES addresses(id),
    mailing_address_id          UUID REFERENCES addresses(id),
    mailing_address_different   BOOLEAN NOT NULL DEFAULT FALSE,
    preferred_language          VARCHAR(50),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_applicant_profiles_user_id ON applicant_profiles(user_id);

-- ============================================================
-- 4. HOUSEHOLD (reusable across every benefit application)
-- ============================================================

CREATE TABLE households (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id                UUID NOT NULL
                                    REFERENCES applicant_profiles(id) ON DELETE CASCADE,
    household_size              INT NOT NULL CHECK (household_size > 0),
    annual_household_income     NUMERIC(12,2),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_households_applicant_id ON households(applicant_id);

CREATE TABLE household_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id    UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    relationship    VARCHAR(50) NOT NULL,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    date_of_birth   DATE,
    income          NUMERIC(12,2),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_household_members_household_id ON household_members(household_id);

-- ============================================================
-- 5. EMPLOYMENT / INCOME (reusable, reduces re-entry across forms)
-- ============================================================

CREATE TABLE employers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name      VARCHAR(255) NOT NULL,
    fein            VARCHAR(20) UNIQUE,
    address_id      UUID REFERENCES addresses(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE employment_records (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id            UUID NOT NULL
                                REFERENCES applicant_profiles(id) ON DELETE CASCADE,
    employer_id             UUID NOT NULL REFERENCES employers(id),
    tax_year                INT,
    wages                   NUMERIC(12,2),
    federal_tax_withheld    NUMERIC(12,2),
    state_wages             NUMERIC(12,2),
    state_income_tax        NUMERIC(12,2),
    local_wages             NUMERIC(12,2),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_employment_records_applicant_id ON employment_records(applicant_id);

CREATE TABLE income_sources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id    UUID NOT NULL
                        REFERENCES applicant_profiles(id) ON DELETE CASCADE,
    source_type     VARCHAR(30) NOT NULL
                        CHECK (source_type IN ('EMPLOYMENT','SSI','SSDI','CHILD_SUPPORT','UNEMPLOYMENT','OTHER')),
    amount          NUMERIC(12,2) NOT NULL,
    frequency       VARCHAR(20) NOT NULL DEFAULT 'ANNUAL',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_income_sources_applicant_id ON income_sources(applicant_id);

-- ============================================================
-- 6. OCR EXTRACTION + PROVENANCE
-- ============================================================

CREATE TABLE ocr_extractions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id    UUID NOT NULL
                        REFERENCES applicant_profiles(id) ON DELETE CASCADE,
    source_type     VARCHAR(30) NOT NULL
                        CHECK (source_type IN ('DRIVERS_LICENSE','STATE_ID','W2','PASSPORT')),
    model_name      VARCHAR(100),
    model_version   VARCHAR(50),
    fields          JSONB NOT NULL,        -- raw structured OCR output, shape varies by doc type
    confidence      NUMERIC(4,3),
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ocr_extractions_applicant_id ON ocr_extractions(applicant_id);

CREATE TABLE field_provenance (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id    UUID NOT NULL
                        REFERENCES applicant_profiles(id) ON DELETE CASCADE,
    field_key       VARCHAR(100) NOT NULL,
    value_text      TEXT,
    source_type     VARCHAR(30) NOT NULL
                        CHECK (source_type IN
                            ('USER','DRIVERS_LICENSE','STATE_ID','W2','PASSPORT','SYSTEM','ADMIN','APPLICATION')),
    extraction_id   UUID REFERENCES ocr_extractions(id),
    confidence      NUMERIC(4,3),
    verified        BOOLEAN NOT NULL DEFAULT FALSE,
    is_canonical    BOOLEAN NOT NULL DEFAULT FALSE,
    extracted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_field_provenance_applicant_id ON field_provenance(applicant_id);
CREATE INDEX idx_field_provenance_field_key ON field_provenance(field_key);

-- ============================================================
-- 7. BENEFIT PROGRAMS / DYNAMIC FORMS
-- ============================================================

CREATE TABLE benefit_programs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(50) NOT NULL UNIQUE,   -- e.g. FAIR_FARES, IDNYC
    name            VARCHAR(150) NOT NULL,
    description     TEXT,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE form_versions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    benefit_program_id  UUID NOT NULL REFERENCES benefit_programs(id) ON DELETE CASCADE,
    version_number      INT NOT NULL,
    effective_from      DATE NOT NULL,
    effective_to        DATE,
    UNIQUE (benefit_program_id, version_number)
);

CREATE TABLE form_fields (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_version_id     UUID NOT NULL REFERENCES form_versions(id) ON DELETE CASCADE,
    field_key           VARCHAR(100) NOT NULL,
    label               VARCHAR(150) NOT NULL,
    data_type           VARCHAR(30) NOT NULL
                            CHECK (data_type IN ('text','integer','currency','date','boolean','object','enum')),
    required            BOOLEAN NOT NULL DEFAULT FALSE,
    section             VARCHAR(50),
    display_order       INT,
    UNIQUE (form_version_id, field_key)
);

-- ============================================================
-- 8. ELIGIBILITY RULES (versioned, dynamic, cached from external sources)
-- ============================================================

CREATE TABLE eligibility_rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    benefit_program_id  UUID NOT NULL REFERENCES benefit_programs(id) ON DELETE CASCADE,
    rule_key            VARCHAR(100) NOT NULL,      -- e.g. max_fpl_pct, min_age
    rule_value          VARCHAR(255) NOT NULL,
    source_api          VARCHAR(255),                -- where the value was fetched from
    effective_from      DATE NOT NULL,
    effective_to        DATE,
    fetched_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_eligibility_rules_program ON eligibility_rules(benefit_program_id, rule_key);

-- ============================================================
-- 9. APPLICATIONS + IMMUTABLE SNAPSHOTS
-- ============================================================

CREATE TABLE applications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id        UUID NOT NULL REFERENCES applicant_profiles(id) ON DELETE CASCADE,
    benefit_program_id  UUID NOT NULL REFERENCES benefit_programs(id),
    form_version_id     UUID NOT NULL REFERENCES form_versions(id),
    status              VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
                            CHECK (status IN
                                ('DRAFT','IN_PROGRESS','MISSING_INFORMATION','READY_FOR_REVIEW',
                                 'USER_REVIEW','SUBMITTED','PROCESSING','ACTION_REQUIRED',
                                 'APPROVED','DENIED','CANCELLED','CLOSED')),
    answers             JSONB NOT NULL DEFAULT '{}',   -- benefit-specific, form-only answers
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at        TIMESTAMPTZ
);

CREATE INDEX idx_applications_applicant_id ON applications(applicant_id);
CREATE INDEX idx_applications_program_status ON applications(benefit_program_id, status);
CREATE INDEX idx_applications_answers_gin ON applications USING GIN (answers);

CREATE TABLE application_status_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    status          VARCHAR(30) NOT NULL,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    changed_by      VARCHAR(30)     -- USER, SYSTEM, ADMIN
);

CREATE INDEX idx_status_history_application_id ON application_status_history(application_id);

CREATE TABLE application_snapshots (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id              UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    form_version_id             UUID NOT NULL REFERENCES form_versions(id),
    submitted_data              JSONB NOT NULL,        -- frozen copy: answers + relevant canonical fields
    eligibility_rule_versions   JSONB,                 -- which eligibility_rules rows were active at submission
    submitted_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_snapshots_application_id ON application_snapshots(application_id);

-- ============================================================
-- 10. AUDIT LOG
-- ============================================================

CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_type      VARCHAR(20) NOT NULL CHECK (actor_type IN ('USER','SYSTEM','ADMIN')),
    actor_id        UUID,
    action          VARCHAR(50) NOT NULL,       -- e.g. FIELD_CHANGED, APPLICATION_SUBMITTED
    entity_type     VARCHAR(50) NOT NULL,       -- e.g. applicant_profiles, applications
    entity_id       UUID NOT NULL,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
