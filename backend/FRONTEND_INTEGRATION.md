# Frontend integration contract

## System overview

The backend exposes three separate domain workflows:

```ts
discoverBenefits(profile) // broad catalog relevance; not eligibility
checkEligibility(profile) // deterministic Fair Fares, IDNYC, and NYC Care checks
generateFormPayload(profile, programId, eligibilityResult) // semantic form handoff
```

The package also exposes a thin HTTP transport layer. See `FRONTEND_API_SPEC.md` for local setup and the implemented `/api/v1/*` endpoints.

## CLIENT INPUT CONTRACT

The frontend supplies the canonical `MockUserProfile` shown below. `id` is required by the TypeScript contract; all nested profile fields are optional so that the backend can return `needs_more_information` instead of rejecting an incomplete profile.

`NYC external` below means the current NYC Open Data catalog request. It receives **no profile fields**. `Gemini` receives only the derived values noted below, never raw identity/contact/address fields. `confirmedFields` is used only for form payload readiness.

| Field path | Type | Required | Example | Used by | PII | Gemini | NYC external | User-confirmed for form |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| `id` | `string` | Yes | `"demo_user_001"` | Form payload applicant ID | Identifier | No | No | No |
| `identity.firstName` | `string` | No | `"Demo"` | Form mappings | Yes | No | No | Yes when mapped |
| `identity.lastName` | `string` | No | `"Student"` | Form mappings | Yes | No | No | Yes when mapped |
| `identity.dateOfBirth` | `string` (`YYYY-MM-DD`) | No | `"2002-09-01"` | Derives age; form mappings | Yes | No; only derived age | No | Yes when mapped |
| `contact.email` | `string` | No | `"demo@example.test"` | Form mappings | Yes | No | No | Yes when mapped |
| `contact.phone` | `string` | No | `"212-555-0100"` | Form mappings | Yes | No | No | Yes when mapped |
| `residence.street` | `string` | No | `"99 Fictional Avenue"` | Form mappings | Yes | No | No | Yes when mapped |
| `residence.city` | `string` | No | `"New York"` | Derives NYC residency; form mappings | Location data | No | No | Yes when mapped |
| `residence.state` | `string` | No | `"NY"` | Derives NYC residency; form mappings | Location data | No | No | Yes when mapped |
| `residence.zipCode` | `string` | No | `"10001"` | Form mappings | Location data | No | No | Yes when mapped |
| `residence.borough` | `string` | No | `"Manhattan"` | Derives NYC residency | Location data | No | No | No |
| `household.householdSize` | `number` | No | `1` | Discovery; Fair Fares; form mappings | No | Yes | No | Yes when mapped |
| `household.annualIncome` | `number` | No | `12000` | Discovery; Fair Fares; form mappings | Financial | Only derived income band | No | Yes when mapped |
| `healthcare.hasInsurance` | `boolean` | No | `false` | Discovery context | Health-related | Yes | No | No |
| `healthcare.insuranceEligibility` | `"eligible" \| "not_eligible" \| "unknown"` | No | `"unknown"` | Discovery; NYC Care; NYC Care form mapping | Health-related | Yes | No | Yes when mapped |
| `healthcare.canAffordInsurance` | `boolean` | No | `false` | NYC Care; NYC Care form mapping | Financial/health-related | No | No | Yes when mapped |
| `transportation.receivesTransportationDiscount` | `boolean` | No | `false` | Discovery; Fair Fares; Fair Fares form mapping | No | Derived as `transportationNeeds` | No | Yes when mapped |
| `transportation.receivesFullCarfare` | `boolean` | No | `false` | Fair Fares; Fair Fares form mapping | No | No | No | Yes when mapped |
| `transportation.fairFaresDiscountType` | `"subway_bus" \| "access_a_ride"` | No | `"access_a_ride"` | Fair Fares when another discount exists | No | No | No | No |
| `benefits.employmentStatus` | `string` | No | `"student"` | Discovery context | No | Yes | No | No |
| `benefits.studentStatus` | `boolean` | No | `true` | Discovery context | No | Yes | No | No |
| `confirmedFields` | `string[]` | No | `["identity.firstName"]` | Form payload confirmation | May reveal field paths, not values | No | No | Supplies confirmations |

`validateProfile()` reports issues for an empty `id`, invalid ISO DOB, household size below 1, negative annual income, and unsupported insurance/Fair Fares union values. The current `checkEligibility()` invokes it but does not return those profile issues; clients should validate these constraints before calling an eventual API.

## Client-supplied versus backend-derived fields

### Client-supplied fields

All fields in `MockUserProfile`, including `id`, optional identity/contact/residence/household/healthcare/transportation/benefits data, and `confirmedFields`.

### Backend-derived fields

Do not duplicate these rules in the frontend:

- `age` from `identity.dateOfBirth`
- `nycResident` from `residence.borough`, or `residence.city` plus `residence.state`
- validated `householdSize` and `annualIncome`
- `annualIncomeBand` for Gemini (`under_25k`, `25k_to_50k`, `50k_to_100k`, `100k_plus`)
- `transportationNeeds` from `receivesTransportationDiscount === false`
- deterministic eligibility statuses, reasons, and missing fields
- program capability flags
- catalog/Gemini relevance score and discovery provenance
- form-field missing state, confirmation state, and `readyForPreview`

## Required fields by workflow

### A. Broad benefit discovery

`discoverBenefits(profile)` can return recommendations from a partial profile.

| Level | Fields |
| --- | --- |
| Required by TypeScript | `id` |
| Recommended | DOB, residence city/state or borough, household size/income, student/employment, health and transportation answers |
| Optional | All nested fields |
| Derived | Age, NYC residency, income band, transportation need |

Discovery is a relevance/recommendation result only. It does not claim official eligibility. The current Open Data catalog request receives no profile information. Gemini, when enabled, receives only the derived context plus official program metadata.

### B. Fair Fares detailed validation

To reach `potentially_eligible`, supply:

- NYC residency inputs: `residence.borough`, or both `residence.city` and `residence.state`
- `identity.dateOfBirth` (for derived age)
- `household.householdSize`
- `household.annualIncome`
- `transportation.receivesFullCarfare`
- `transportation.receivesTransportationDiscount`

If `receivesTransportationDiscount` is `true`, also supply `transportation.fairFaresDiscountType`. Missing values produce `needs_more_information`; they are not automatic rejection. `confirmedFields` does not affect eligibility validation.

### C. IDNYC detailed validation

To reach `potentially_eligible`, supply NYC residency inputs and `identity.dateOfBirth`. The validator checks derived residency and age only; document requirements are outside this validator.

### D. NYC Care detailed validation

To reach `potentially_eligible`, supply:

- NYC residency inputs
- `healthcare.insuranceEligibility` as `"not_eligible"`
- `healthcare.canAffordInsurance` as `false`

Missing residency, unknown/missing insurance eligibility, or missing affordability produces `needs_more_information`. The backend does not infer affordability from income.

### E. Form payload generation

`generateFormPayload()` additionally requires a matching `EligibilityResult` and the program's mapped fields to be present and confirmed. `readyForPreview` is `true` only when the detailed result is `potentially_eligible`, there are no missing fields, and every mapped field is confirmed.

| Program | Mapped profile fields |
| --- | --- |
| Fair Fares | first/last name, DOB, street/city/state/ZIP, email, phone, household size/income, full carfare, transportation discount |
| IDNYC | first/last name, DOB, street/city/state/ZIP, email, phone |
| NYC Care | first/last name, DOB, street/city/state/ZIP, email, phone, household size/income, insurance eligibility, affordability result |

## TypeScript contracts

```ts
export interface ClientUserProfile {
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

export type BenefitDiscoveryStatus =
  | 'recommended_match'
  | 'possible_match'
  | 'needs_more_information';

export interface BenefitRecommendation {
  programId: string;
  programCode?: string;
  programName: string;
  discoveryStatus: BenefitDiscoveryStatus;
  relevanceScore?: number;
  category?: string;
  summary?: string;
  whyItMayHelp?: string;
  missingInformation?: string[];
  officialSourceUrl?: string;
  applicationUrl?: string;
  detailedValidationSupported: boolean;
  formAutomationSupported: boolean;
  source: { type: 'nyc_dataset' | 'fixture'; lastVerified?: string };
  discoverySource: 'gemini_catalog_match' | 'catalog_pre_filter' | 'fixture_screening' | 'nyc_screening_api';
  metadataSource: 'live_nyc_dataset' | 'fixture_catalog';
  explanationSource: 'gemini' | 'official_description';
}

export type EligibilityStatus = 'potentially_eligible' | 'needs_more_information' | 'likely_not_eligible';

export interface EligibilityResult {
  programId: string;
  programName: string;
  status: EligibilityStatus;
  reasons: string[];
  missingFields: string[];
  source: { name: string; url: string; lastVerified: string };
}

export interface FormFieldValue {
  value: string | number | boolean | null;
  source: string;
  confirmed: boolean;
}

export interface FormFillPayload {
  programId: string;
  applicantId: string;
  eligibilityStatus: EligibilityStatus;
  fields: Record<string, FormFieldValue>;
  missingFields: string[];
  readyForPreview: boolean;
}
```

## Example client profile

All values are fictional demo data.

```json
{
  "id": "demo_user_001",
  "identity": { "firstName": "Demo", "lastName": "Student", "dateOfBirth": "2002-09-01" },
  "contact": { "email": "demo.student@example.test", "phone": "212-555-0100" },
  "residence": { "street": "99 Fictional Avenue", "city": "New York", "state": "NY", "zipCode": "10001", "borough": "Manhattan" },
  "household": { "householdSize": 1, "annualIncome": 12000 },
  "healthcare": { "insuranceEligibility": "unknown" },
  "transportation": { "receivesFullCarfare": false, "receivesTransportationDiscount": false },
  "benefits": { "employmentStatus": "student", "studentStatus": true },
  "confirmedFields": ["identity.firstName", "identity.lastName", "identity.dateOfBirth"]
}
```

## Broad discovery output

`await discoverBenefits(profile)` returns `Promise<BenefitRecommendation[]>`.

```json
{
  "programId": "p007en",
  "programCode": "S2R007",
  "programName": "Supplemental Nutrition Assistance Program",
  "discoveryStatus": "recommended_match",
  "relevanceScore": 91,
  "category": "Food",
  "summary": "Official program description...",
  "whyItMayHelp": "May be relevant based on the supplied non-identifying context.",
  "missingInformation": ["household composition"],
  "officialSourceUrl": "https://data.cityofnewyork.us/...",
  "detailedValidationSupported": false,
  "formAutomationSupported": false,
  "source": { "type": "nyc_dataset", "lastVerified": "2026-08-15" },
  "discoverySource": "gemini_catalog_match",
  "metadataSource": "live_nyc_dataset",
  "explanationSource": "gemini"
}
```

Frontend interpretation:

- `discoveryStatus`: show a relevance badge such as “Recommended match,” “Possible match,” or “More information needed.” Never display it as eligibility.
- `relevanceScore`: optional sort/display signal only.
- `summary` and `whyItMayHelp`: display as informational text; preserve official source links.
- `missingInformation`: prompt optional follow-up questions, without converting them to eligibility rules.
- `detailedValidationSupported`: enable “Check details” only when true.
- `formAutomationSupported`: enable “Prepare application” only after detailed validation is potentially eligible.
- provenance fields: useful for debug/admin transparency, not a user-facing eligibility conclusion.

## Detailed validation output

`checkEligibility(profile)` returns all three supported program results. A future per-program API should select the requested program from this array.

```json
{
  "programId": "fair_fares",
  "programName": "Fair Fares NYC",
  "status": "potentially_eligible",
  "reasons": [],
  "missingFields": [],
  "source": {
    "name": "Fair Fares NYC",
    "url": "https://www.nyc.gov/site/fairfares/",
    "lastVerified": "2026-08-15"
  }
}
```

- `potentially_eligible`: show “Potential match confirmed by detailed validation.” It is not an official approval. Permit form preparation only if that program supports it.
- `needs_more_information`: use only `missingFields` to ask targeted questions, then call validation again with the updated profile.
- `likely_not_eligible`: show `reasons` and source information. Never label it an official denial.

## Form payload output

```json
{
  "programId": "fair_fares",
  "applicantId": "demo_user_001",
  "eligibilityStatus": "potentially_eligible",
  "fields": {
    "first_name": { "value": "Demo", "source": "identity.firstName", "confirmed": true },
    "annual_income": { "value": 12000, "source": "household.annualIncome", "confirmed": true }
  },
  "missingFields": [],
  "readyForPreview": true
}
```

`source` is a canonical profile path, **not** a DOM/PDF selector. The form-automation team owns the semantic field key (for example `first_name`) to actual site/PDF selector mapping.

## Missing-field handling

Backend missing field names are canonical/derived keys, for example `nycResident`, `age`, `householdSize`, `annualIncome`, `receivesFullCarfare`, `receivesTransportationDiscount`, `fairFaresDiscountType`, `insuranceEligibility`, and `canAffordInsurance`.

Maintain a frontend-only presentation registry. It maps a backend key to a prompt but must not contain eligibility logic.

```ts
const FIELD_UI_CONFIG = {
  insuranceEligibility: { label: 'Are you eligible for another health insurance plan?', inputType: 'select' },
  canAffordInsurance: { label: 'Can you afford the available health insurance?', inputType: 'boolean' },
  receivesFullCarfare: { label: 'Do you receive or qualify for full carfare from a NYC agency?', inputType: 'boolean' },
} as const;
```

## Confirmation handling

`confirmedFields` contains canonical source paths, such as `identity.firstName` or `household.annualIncome`.

```text
Document extraction or prefill -> value present, unconfirmed
User reviews or manually enters value -> add its source path to confirmedFields
generateFormPayload() -> each mapped field receives confirmed: true/false
```

For a preview-ready payload, every mapped value must be present and its exact source path must appear in `confirmedFields`. Confirmation does not affect broad discovery or deterministic eligibility.

## FRONTEND PRIVACY RESPONSIBILITIES

The frontend may send the canonical profile only to **our backend** over the team-defined authenticated transport. It must never call Gemini directly.

```text
Frontend -> canonical profile -> our backend
Our backend -> derived, privacy-safe recommendation context -> Gemini
Our backend -> no profile data -> NYC Open Data catalog
```

Gemini never receives name, raw DOB, email, phone, street address, ZIP code, SEVIS/passport data, document content, or raw annual income. It receives derived age, residency, household size, income band, selected benefit answers, and official catalog metadata. `GEMINI_API_KEY` remains backend-only.

## Implemented API boundary

| Method | URL | Request | Success response | Errors |
| --- | --- | --- | --- | --- |
| `POST` | `/api/v1/benefits/discover` | `{ profile: ClientUserProfile }` | `{ success: true, data: { recommendations: BenefitRecommendation[] } }` | `INVALID_REQUEST`, `INVALID_PROFILE`, `INTERNAL_ERROR` |
| `POST` | `/api/v1/benefits/:programId/validate` | `{ profile: ClientUserProfile }` | `{ success: true, data: { result: EligibilityResult } }` | `INVALID_REQUEST`, `INVALID_PROFILE`, `PROGRAM_NOT_SUPPORTED`, `DETAILED_VALIDATION_NOT_SUPPORTED` |
| `POST` | `/api/v1/forms/:programId/payload` | `{ profile: ClientUserProfile, eligibilityResult: EligibilityResult }` | `{ success: true, data: { payload: FormFillPayload } }` | `INVALID_REQUEST`, `INVALID_PROFILE`, `FORM_AUTOMATION_NOT_SUPPORTED`, `MISSING_INFORMATION` |

Recommended shared error shape:

```ts
export interface ApiErrorResponse {
  success: false;
  error: { code: string; message: string; fields?: string[] };
}
```

These response envelopes and error codes are emitted by the HTTP layer; domain functions remain transport-independent.

### Example requests

```http
POST /api/v1/benefits/discover
Content-Type: application/json

{ "profile": { "id": "demo_user_001", "residence": { "city": "New York", "state": "NY" } } }
```

```json
{ "success": true, "data": { "recommendations": [] } }
```

```http
POST /api/v1/benefits/fair_fares/validate
Content-Type: application/json

{ "profile": { "id": "demo_user_001", "identity": { "dateOfBirth": "2002-09-01" } } }
```

```json
{ "success": true, "data": { "result": { "programId": "fair_fares", "status": "needs_more_information", "reasons": [], "missingFields": ["nycResident", "householdSize", "annualIncome", "receivesFullCarfare", "receivesTransportationDiscount"], "programName": "Fair Fares NYC", "source": { "name": "Fair Fares NYC", "url": "https://www.nyc.gov/site/fairfares/", "lastVerified": "2026-08-15" } } } }
```

```http
POST /api/v1/forms/fair_fares/payload
Content-Type: application/json

{ "profile": { "id": "demo_user_001" }, "eligibilityResult": { "programId": "fair_fares", "programName": "Fair Fares NYC", "status": "potentially_eligible", "reasons": [], "missingFields": [], "source": { "name": "Fair Fares NYC", "url": "https://www.nyc.gov/site/fairfares/", "lastVerified": "2026-08-15" } } }
```

```json
{ "success": true, "data": { "payload": { "programId": "fair_fares", "applicantId": "demo_user_001", "eligibilityStatus": "potentially_eligible", "fields": {}, "missingFields": ["first_name", "last_name", "date_of_birth", "street_address", "city", "state", "zip_code", "email", "phone", "household_size", "annual_income", "receives_full_carfare", "receives_transportation_discount"], "readyForPreview": false } } }
```

## React/Expo integration flow

```ts
const recommendations = await benefitsApi.discover(profile);
const selected = recommendations.find((program) => program.programId === selectedProgramId);

if (selected?.detailedValidationSupported) {
  const validation = await benefitsApi.validate(selected.programId, profile);

  if (validation.status === 'needs_more_information') {
    // Render only fields named by validation.missingFields.
  }

  if (validation.status === 'potentially_eligible' && selected.formAutomationSupported) {
    const payload = await benefitsApi.generateFormPayload(selected.programId, profile, validation);
    // Hand payload to the preview/form-automation integration only when readyForPreview is true.
  }
}
```

## Current integration gaps

The repository currently has:

- implemented local HTTP routes, configurable CORS, and API documentation;
- no frontend API client;
- no transport authentication configuration;
- no shared frontend/backend contract package.

For Expo integration, the frontend team must configure its API base URL and add a client adapter.

## Shared contract proposal

Before duplicating interface definitions in Expo, consider a future `shared/contracts/` package containing `profile.ts`, `benefits.ts`, and `form-payload.ts`. Shared contracts reduce drift in union values and field names; duplicated types are simpler initially but can silently diverge. This is a recommendation only—no shared-package refactor is included here.

## Handoff checklist

- [ ] Collect the canonical profile incrementally; do not require every field at discovery time.
- [ ] Send canonical profile only to the backend, never Gemini.
- [ ] Display discovery as relevance, not eligibility.
- [ ] Run detailed validation only after a supported program is selected.
- [ ] Prompt only returned `missingFields`.
- [ ] Track user-reviewed field paths in `confirmedFields`.
- [ ] Generate form payload only from the matching detailed result.
- [ ] Send semantic form fields—not selectors—to the automation integration.
- [ ] Configure the implemented HTTP API and add a frontend client before connecting Expo to this backend.
