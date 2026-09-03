-- ============================================================
-- Migration: applicant_healthcare and applicant_transportation
-- Program-relevant facts not covered by the Screening API's
-- household/person model — needed specifically for NYC Care
-- (healthcare) and Fair Fares (transportation) eligibility.
-- Same reasoning as `households`: one row per applicant, 1:1.
-- ============================================================

CREATE TABLE applicant_healthcare (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id UUID NOT NULL UNIQUE REFERENCES applicant_profiles(id) ON DELETE CASCADE,
    has_insurance BOOLEAN,
    insurance_eligibility VARCHAR(20) CHECK (insurance_eligibility IN ('eligible', 'not_eligible', 'unknown')),
    can_afford_insurance BOOLEAN,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE applicant_transportation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id UUID NOT NULL UNIQUE REFERENCES applicant_profiles(id) ON DELETE CASCADE,
    receives_transportation_discount BOOLEAN,
    receives_full_carfare BOOLEAN,
    fair_fares_discount_type VARCHAR(20) CHECK (fair_fares_discount_type IN ('subway_bus', 'access_a_ride')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_applicant_healthcare_applicant_id ON applicant_healthcare(applicant_id);
CREATE INDEX idx_applicant_transportation_applicant_id ON applicant_transportation(applicant_id);
