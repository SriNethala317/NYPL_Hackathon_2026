# Shared field contract

Audience: Frontend, Backend, Database, and Form Automation teams.

This document is the naming reference for the current benefits profile and its downstream contracts. It describes existing code in `backend/src/features`; database names are explicitly **proposed** because this repository has no database schema. Do not rename a field from this document without coordinating all consumers.

## Team quick reference

```text
Frontend/API JSON      -> camelCase canonical profile objects
Canonical paths        -> domain.fieldName (for example household.annualIncome)
Backend TypeScript     -> camelCase properties
Database               -> proposed snake_case columns, grouped by entity
Form semantic keys     -> snake_case (not selectors or coordinates)
External AI context    -> backend-derived and privacy-safe only
```

## Naming conventions

- API bodies use the existing canonical `MockUserProfile` nesting: `{ profile: { household: { annualIncome } } }`.
- Canonical paths are the source-of-truth references used in `confirmedFields` and form mappings.
- Form keys such as `annual_income` intentionally differ from canonical `household.annualIncome`.
- Proposed database columns use `snake_case`; this is a storage convention, not an API contract.
- “Required” means required by the current TypeScript/API transport contract. Nested inputs are optional so validators can return `needs_more_information`.

## Canonical profile schema

There are **22 canonical user-input fields**, including `confirmedFields`. `id` is required; the other leaf fields are optional in the current schema.

```ts
export interface MockUserProfile {
  id: string;
  identity?: { firstName?: string; lastName?: string; dateOfBirth?: string };
  contact?: { email?: string; phone?: string };
  residence?: { street?: string; city?: string; state?: string; zipCode?: string; borough?: string };
  household?: { householdSize?: number; annualIncome?: number };
  healthcare?: {
    hasInsurance?: boolean;
    insuranceEligibility?: 'eligible' | 'not_eligible' | 'unknown';
    canAffordInsurance?: boolean;
  };
  transportation?: {
    receivesTransportationDiscount?: boolean;
    receivesFullCarfare?: boolean;
    fairFaresDiscountType?: 'subway_bus' | 'access_a_ride';
  };
  benefits?: { employmentStatus?: string; studentStatus?: boolean };
  confirmedFields?: string[];
}
```

The source provenance of a value (manual entry versus document extraction) is **not represented as a field in the current profile contract**. Teams may track that separately, but must not change the canonical value path.

## Main field mapping

“Source” below is the expected workflow source, not a currently persisted profile property. “Used by” names existing backend workflows.

| Canonical path | Type | Required? | Frontend/backend field | Proposed DB column | Form semantic key(s) | Source | PII? | Confirmation required? | Used by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `id` | `string` | Yes | `id` | `users.user_id` | — | app/auth | Identifier | No | API + form `applicantId` |
| `identity.firstName` | `string` | Optional | `firstName` | `user_profiles.first_name` | `first_name` | user/document | Yes | Yes if mapped | form payload |
| `identity.lastName` | `string` | Optional | `lastName` | `user_profiles.last_name` | `last_name` | user/document | Yes | Yes if mapped | form payload |
| `identity.dateOfBirth` | `string` ISO `YYYY-MM-DD` | Optional | `dateOfBirth` | `user_profiles.date_of_birth` | `date_of_birth` | user/document | Yes | Yes if mapped | age derivation, validation, form payload |
| `contact.email` | `string` | Optional | `email` | `user_profiles.email` | `email` | user/document | Yes | Yes if mapped | form payload |
| `contact.phone` | `string` | Optional | `phone` | `user_profiles.phone` | `phone` | user/document | Yes | Yes if mapped | form payload |
| `residence.street` | `string` | Optional | `street` | `residences.street` | `street_address` | user/document | Yes | Yes if mapped | form payload |
| `residence.city` | `string` | Optional | `city` | `residences.city` | `city` | user/document | Location | Yes if mapped | NYC residency derivation, form payload |
| `residence.state` | `string` | Optional | `state` | `residences.state` | `state` | user/document | Location | Yes if mapped | NYC residency derivation, form payload |
| `residence.zipCode` | `string` | Optional | `zipCode` | `residences.zip_code` | `zip_code` | user/document | Location | Yes if mapped | form payload |
| `residence.borough` | `string` | Optional | `borough` | `residences.borough` | — | user/document | Location | No | NYC residency derivation |
| `household.householdSize` | `number` | Optional | `householdSize` | `household_information.household_size` | `household_size` | user/document | No | Yes if mapped | discovery, Fair Fares, form payload |
| `household.annualIncome` | `number` | Optional | `annualIncome` | `household_information.annual_income` | `annual_income` | user/document | Financial | Yes if mapped | discovery, Fair Fares, form payload |
| `healthcare.hasInsurance` | `boolean` | Optional | `hasInsurance` | `healthcare_information.has_insurance` | — | user/document | Health | No | discovery context |
| `healthcare.insuranceEligibility` | `'eligible' \| 'not_eligible' \| 'unknown'` | Optional | `insuranceEligibility` | `healthcare_information.insurance_eligibility` | `insurance_eligibility` | official screening/user | Health | Yes if mapped | discovery, NYC Care, form payload |
| `healthcare.canAffordInsurance` | `boolean` | Optional | `canAffordInsurance` | `healthcare_information.can_afford_insurance` | `can_afford_insurance` | official affordability screening/user | Health/financial | Yes if mapped | NYC Care, form payload |
| `transportation.receivesTransportationDiscount` | `boolean` | Optional | `receivesTransportationDiscount` | `transportation_information.receives_transportation_discount` | `receives_transportation_discount` | user/agency | No | Yes if mapped | discovery, Fair Fares, form payload |
| `transportation.receivesFullCarfare` | `boolean` | Optional | `receivesFullCarfare` | `transportation_information.receives_full_carfare` | `receives_full_carfare` | user/agency | No | Yes if mapped | Fair Fares, form payload |
| `transportation.fairFaresDiscountType` | `'subway_bus' \| 'access_a_ride'` | Optional | `fairFaresDiscountType` | `transportation_information.fair_fares_discount_type` | — | user/agency | No | No | Fair Fares |
| `benefits.employmentStatus` | `string` | Optional | `employmentStatus` | `benefit_context.employment_status` | — | user | No | No | discovery context |
| `benefits.studentStatus` | `boolean` | Optional | `studentStatus` | `benefit_context.student_status` | — | user | No | No | discovery context |
| `confirmedFields` | `string[]` of canonical paths | Optional | `confirmedFields` | `profile_field_confirmations.canonical_path` | — | frontend/user review | Metadata | N/A; it records confirmation | form payload readiness |

## Derived fields — do not store as user input by default

The backend owns business-rule derivation. The frontend should display derived outputs but must not reimplement the calculations.

| Derived field | Source fields | Owner | Frontend computes? | Proposed persistence |
| --- | --- | --- | --- | --- |
| `age` | `identity.dateOfBirth` | backend normalization | No | Compute on demand; do not persist as source-of-truth |
| `nycResident` | `residence.borough` or `residence.city` + `residence.state` | backend normalization | No | Compute on demand |
| validated `householdSize` | `household.householdSize` | backend normalization | No | Store source value only |
| validated `annualIncome` | `household.annualIncome` | backend normalization | No | Store source value only |
| `annualIncomeBand` | `household.annualIncome` | backend recommendation projection | No | Compute on demand |
| `transportationNeeds` | `transportation.receivesTransportationDiscount === false` | backend recommendation projection | No | Compute on demand |
| `discoveryStatus`, `relevanceScore`, `missingInformation` | catalog + safe context + optional Gemini | backend discovery | No | Optional audit/cache only; not profile truth |
| `EligibilityResult.status`, `reasons`, `missingFields` | normalized eligibility facts + official rules | backend validator | No | Optional audit/cache with source version |
| `FormFillPayload.readyForPreview` | detailed result + mappings + `confirmedFields` | backend form generator | No | Compute on demand |

## Discovery and Gemini context

Canonical profile data remains internal. The current NYC Open Data catalog request sends no profile values. Gemini receives this backend-derived projection only when Gemini is enabled.

| Recommendation context field | Derived from | Sent to Gemini? | PII? | Notes |
| --- | --- | --- | --- | --- |
| `age` | `identity.dateOfBirth` | Yes | No; derived | Raw DOB is excluded |
| `nycResident` | residence fields | Yes | No; derived | Boolean/unknown only |
| `householdSize` | `household.householdSize` | Yes | No | Must be valid integer ≥ 1 to normalize |
| `annualIncomeBand` | `household.annualIncome` | Yes | No; derived | Raw income is excluded |
| `employmentStatus` | `benefits.employmentStatus` | Yes | No | Current string is passed as supplied |
| `studentStatus` | `benefits.studentStatus` | Yes | No | Boolean |
| `hasInsurance` | `healthcare.hasInsurance` | Yes | Health-related | No direct identity data |
| `insuranceEligibility` | `healthcare.insuranceEligibility` | Yes | Health-related | Existing union value |
| `transportationNeeds` | transportation discount answer | Yes | No; derived | True only when discount is explicitly false |

Never send `identity.*`, `contact.*`, raw `residence.*`, `confirmedFields`, raw annual income, document contents, SEVIS IDs, or passport values to Gemini.

## Detailed validation matrix

| Program | Canonical field / derived input | Purpose | Missing behavior |
| --- | --- | --- | --- |
| Fair Fares | `nycResident` ← residence | NYC residency | `nycResident` |
| Fair Fares | `age` ← DOB | 18–64 check | `age` |
| Fair Fares | `household.householdSize` | Select published income limit | `householdSize` |
| Fair Fares | `household.annualIncome` | Compare to income limit | `annualIncome` |
| Fair Fares | `transportation.receivesFullCarfare` | Full-carfare disqualifier | `receivesFullCarfare` |
| Fair Fares | `transportation.receivesTransportationDiscount` | Other transit-discount check | `receivesTransportationDiscount` |
| Fair Fares | `transportation.fairFaresDiscountType` | Required only when other discount is true | `fairFaresDiscountType` |
| IDNYC | `nycResident` ← residence | NYC residency | `nycResident` |
| IDNYC | `age` ← DOB | Minimum-age check | `age` |
| NYC Care | `nycResident` ← residence | NYC residency | `nycResident` |
| NYC Care | `healthcare.insuranceEligibility` | Formal insurance-screening result | `insuranceEligibility` when missing/unknown |
| NYC Care | `healthcare.canAffordInsurance` | Formal affordability-screening result | `canAffordInsurance` |

`missingFields` is a request for more data, not a negative eligibility decision. Existing validator behavior may still return `likely_not_eligible` where supplied values trigger a disqualifying rule.

## Exact form payload mappings

### Fair Fares — 13 semantic keys

| Form semantic key | Canonical profile path | Type |
| --- | --- | --- |
| `first_name` | `identity.firstName` | string |
| `last_name` | `identity.lastName` | string |
| `date_of_birth` | `identity.dateOfBirth` | string |
| `street_address` | `residence.street` | string |
| `city` | `residence.city` | string |
| `state` | `residence.state` | string |
| `zip_code` | `residence.zipCode` | string |
| `email` | `contact.email` | string |
| `phone` | `contact.phone` | string |
| `household_size` | `household.householdSize` | number |
| `annual_income` | `household.annualIncome` | number |
| `receives_full_carfare` | `transportation.receivesFullCarfare` | boolean |
| `receives_transportation_discount` | `transportation.receivesTransportationDiscount` | boolean |

### IDNYC — 9 semantic keys

| Form semantic key | Canonical profile path | Type |
| --- | --- | --- |
| `first_name` | `identity.firstName` | string |
| `last_name` | `identity.lastName` | string |
| `date_of_birth` | `identity.dateOfBirth` | string |
| `street_address` | `residence.street` | string |
| `city` | `residence.city` | string |
| `state` | `residence.state` | string |
| `zip_code` | `residence.zipCode` | string |
| `email` | `contact.email` | string |
| `phone` | `contact.phone` | string |

### NYC Care — 13 semantic keys

| Form semantic key | Canonical profile path | Type |
| --- | --- | --- |
| `first_name` | `identity.firstName` | string |
| `last_name` | `identity.lastName` | string |
| `date_of_birth` | `identity.dateOfBirth` | string |
| `street_address` | `residence.street` | string |
| `city` | `residence.city` | string |
| `state` | `residence.state` | string |
| `zip_code` | `residence.zipCode` | string |
| `email` | `contact.email` | string |
| `phone` | `contact.phone` | string |
| `household_size` | `household.householdSize` | number |
| `annual_income` | `household.annualIncome` | number |
| `insurance_eligibility` | `healthcare.insuranceEligibility` | union string |
| `can_afford_insurance` | `healthcare.canAffordInsurance` | boolean |

Form keys are semantic names only. The Form Automation team owns mapping them to actual website selectors, PDF fields, or coordinates.

## Missing-field keys

### Detailed-validation keys (camelCase derived/input names)

| `missingFields` key | Canonical source | Frontend question? | Suggested input |
| --- | --- | --- | --- |
| `nycResident` | residence fields; backend-derived | Yes; ask city/state or borough | address/borough fields |
| `age` | `identity.dateOfBirth`; backend-derived | Yes | ISO date |
| `householdSize` | `household.householdSize` | Yes | positive integer |
| `annualIncome` | `household.annualIncome` | Yes | non-negative number |
| `receivesFullCarfare` | `transportation.receivesFullCarfare` | Yes | boolean/select |
| `receivesTransportationDiscount` | `transportation.receivesTransportationDiscount` | Yes | boolean/select |
| `fairFaresDiscountType` | `transportation.fairFaresDiscountType` | Yes when another discount is true | `subway_bus` / `access_a_ride` |
| `insuranceEligibility` | `healthcare.insuranceEligibility` | Yes | existing union select |
| `canAffordInsurance` | `healthcare.canAffordInsurance` | Yes | boolean/select |

### Form-payload keys (snake_case semantic keys)

`generateFormPayload()` combines detailed-validation missing keys above with missing mapped form keys, such as `first_name`, `street_address`, `annual_income`, and `insurance_eligibility`. Resolve snake_case values using the exact form mapping tables above; resolve camelCase values using the detailed-validation table.

## Confirmation contract

`confirmedFields` is an array of canonical paths, never form semantic keys:

```json
[
  "identity.firstName",
  "identity.lastName",
  "household.annualIncome"
]
```

```text
Document extraction/prefill -> canonical value exists but is unconfirmed
User reviews or manually enters value -> add its canonical path to confirmedFields
User revokes approval or changes value -> remove the canonical path until reviewed again
generateFormPayload -> mapped field has confirmed true only when source path is present
```

`readyForPreview` is true only when the supplied detailed result is `potentially_eligible`, no eligibility or mapping fields are missing, and every mapped field is confirmed.

## Proposed database mapping — no database currently exists

This is a proposal, not an implementation. Store source profile values in logical groups and join them through `user_id`.

| Proposed table.column | Canonical path | Notes |
| --- | --- | --- |
| `users.user_id` | `id` | Application-level user/applicant identifier |
| `user_profiles.first_name`, `last_name`, `date_of_birth`, `email`, `phone` | `identity.*`, `contact.*` | Private identity/contact data |
| `residences.street`, `city`, `state`, `zip_code`, `borough` | `residence.*` | Private address/location data |
| `household_information.household_size`, `annual_income` | `household.*` | Household/financial source values |
| `healthcare_information.has_insurance`, `insurance_eligibility`, `can_afford_insurance` | `healthcare.*` | Sensitive health/screening answers |
| `transportation_information.receives_transportation_discount`, `receives_full_carfare`, `fair_fares_discount_type` | `transportation.*` | Transportation answers |
| `benefit_context.employment_status`, `student_status` | `benefits.*` | Discovery context answers |
| `profile_field_confirmations.user_id`, `canonical_path` | `confirmedFields[]` | One row per confirmed canonical path is preferred over a serialized array |

Do not store `age`, `nycResident`, `annualIncomeBand`, recommendation scores, or `readyForPreview` as permanent source profile values. If audit/history is needed later, store a timestamped result with its source/version separately from the canonical profile.

## API naming contract

The implemented HTTP API expects the canonical shape unchanged:

```json
{
  "profile": {
    "id": "demo_user_001",
    "household": { "annualIncome": 12000 },
    "transportation": { "receivesFullCarfare": false }
  }
}
```

Endpoints:

```text
POST /api/v1/benefits/discover
POST /api/v1/benefits/:programId/validate
POST /api/v1/forms/:programId/payload
```

The form payload route additionally expects `eligibilityResult` with the existing `EligibilityResult` shape. It does not rename profile fields.

## Naming boundaries and conflicts

| Names observed | Classification | Resolution |
| --- | --- | --- |
| `household.annualIncome` ↔ `annual_income` | Intentional boundary mapping | Canonical path in API/profile; snake_case semantic form/DB name |
| `identity.firstName` ↔ `first_name` | Intentional boundary mapping | Same semantic value across profile and form/DB boundaries |
| `id` ↔ `applicantId` | Intentional output boundary mapping | Payload copies canonical `id` into output-specific `applicantId` |
| `programId` ↔ NYC catalog `programCode` | Intentional separate identifiers | Do not substitute one for the other; both are present in recommendations where available |
| camelCase detailed missing keys + snake_case form missing keys | **Potential UI inconsistency** | `FormFillPayload.missingFields` can contain both; use this document's two missing-key tables before rendering prompts |
| `MockUserProfile` name | Potential naming debt only | It is the current canonical profile contract despite the “Mock” name; do not rename during integration |

## FIELD CONTRACT CHANGE RULES

1. Do not rename a canonical path without frontend, backend, database, and form-automation review.
2. Add a new field to this document before or with its implementation.
3. Keep API JSON aligned with canonical camelCase paths.
4. Database column names may use snake_case only when the mapping is documented here.
5. Form semantic keys are not canonical profile paths and must not replace them.
6. Derived fields never replace their source fields.
7. Keep existing `missingFields` keys stable once UI mappings depend on them.
8. Treat PII and health/financial values as backend-only for external-service projection unless explicitly minimized and documented.

## Team handoff checklist

- Frontend: use the canonical nested camelCase profile shape and the two missing-key registries; store confirmations as canonical paths.
- Backend: derive eligibility/recommendation values from canonical source paths; document every new projection or missing key here.
- Database: implement only the proposed mappings after team approval; retain source values rather than derived replacements.
- Form Automation: consume existing snake_case semantic keys and map them separately to actual form controls; never change canonical profile paths.
