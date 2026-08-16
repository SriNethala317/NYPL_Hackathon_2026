# CODEX_VALIDATION.md

## Project Context

This repository is part of the NYPL Hackathon 2026 project.

The broader product helps NYC residents discover benefits they may potentially qualify for and prepares reusable user data that can later be mapped into government application forms.

This workstream is intentionally limited to:

1. Validating mock user profile data
2. Checking eligibility against verified benefit-program criteria
3. Returning eligibility results with reasons and missing information
4. Generating a normalized form-fill payload for a separate automatic form-filling system

Do not implement authentication, OCR, document extraction, UI redesigns, AI agents, or actual form submission in this task.

Other teammates are responsible for those areas.

---

# Main Goal

Build a reusable validation pipeline:

```text
Mock User Profile
      ↓
Normalize User Data
      ↓
Validate Required Inputs
      ↓
Apply Program Eligibility Rules
      ↓
Generate Eligibility Results
      ↓
Generate Form-Ready Payload
      ↓
Hand Off to Form Automation System
```

The validator must be deterministic.

Do not use an LLM to decide whether a person is eligible.

---

# Initial Programs

Start with these three NYC programs:

```text
Fair Fares NYC
IDNYC
NYC Care
```

These programs are only the first supported examples.

The design should allow additional programs to be added later without rewriting the entire engine.

---

# Source-of-Truth Rule

Eligibility criteria must come from official sources whenever possible.

Preferred sources:

```text
NYC Benefits Screening API
NYC Benefits Platform
ACCESS NYC
NYC Open Data
Official NYC agency websites
Official New York State sources when applicable
```

Do not invent eligibility criteria.

Do not hard-code a rule unless the rule has a documented source.

Every program validator should include source metadata.

Example:

```typescript
source: {
  name: "ACCESS NYC",
  url: "...",
  lastVerified: "YYYY-MM-DD"
}
```

If a requirement cannot be verified, return it as unresolved or missing instead of guessing.

---

# Privacy Principle

Do not pass personally identifiable information into eligibility checks unless it is required.

Separate:

```text
PRIVATE PROFILE
-------------------------
Name
DOB
Street address
Email
Phone
Visa details
SEVIS ID
Uploaded documents
```

from:

```text
ELIGIBILITY PROFILE
-------------------------
Age
NYC resident
Household size
Annual income
Insurance status
Transportation discount status
Other rule-specific inputs
```

The eligibility engine should consume the minimum data required for validation.

---

# Mock User Profile

Use an existing mock user/profile type if one already exists in the repository.

Do not duplicate the profile model unnecessarily.

If a profile type is needed, use a shape similar to:

```typescript
export interface MockUserProfile {
  id: string;

  identity: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
  };

  contact: {
    email?: string;
    phone?: string;
  };

  residence: {
    street?: string;
    city: string;
    state: string;
    zipCode: string;
    borough?: string;
  };

  household: {
    householdSize: number;
    annualIncome: number;
  };

  healthcare: {
    hasInsurance?: boolean;
    insuranceEligibility?:
      | "eligible"
      | "not_eligible"
      | "unknown";
  };

  transportation: {
    receivesTransportationDiscount?: boolean;
    receivesFullCarfare?: boolean;
  };
}
```

Adapt this to the existing repository instead of forcing a new structure.

---

# Eligibility Input

Create a normalized eligibility input.

Example:

```typescript
export interface EligibilityInput {
  age: number;
  nycResident: boolean;
  householdSize: number;
  annualIncome: number;

  hasInsurance?: boolean;

  insuranceEligibility?:
    | "eligible"
    | "not_eligible"
    | "unknown";

  receivesTransportationDiscount?: boolean;
  receivesFullCarfare?: boolean;
}
```

Create a normalization function:

```typescript
normalizeProfileForEligibility(profile)
```

Responsibilities:

- Calculate age from date of birth
- Determine NYC residency from address/borough
- Extract household size
- Extract annual income
- Extract program-specific values
- Avoid passing unrelated PII into the rule engine

---

# Eligibility Status

Do not use only a boolean.

Use:

```typescript
export type EligibilityStatus =
  | "potentially_eligible"
  | "needs_more_information"
  | "likely_not_eligible";
```

Reasoning:

```text
potentially_eligible
= known required criteria currently pass

needs_more_information
= required eligibility inputs are missing or unresolved

likely_not_eligible
= one or more known required criteria fail
```

Never describe the result as an official final government determination.

---

# Eligibility Result

Use a common output shape.

```typescript
export interface EligibilityResult {
  programId: string;
  programName: string;

  status: EligibilityStatus;

  reasons: string[];

  missingFields: string[];

  source: {
    name: string;
    url: string;
    lastVerified: string;
  };
}
```

Example:

```json
{
  "programId": "nyc_care",
  "programName": "NYC Care",
  "status": "needs_more_information",
  "reasons": [
    "Applicant appears to meet the NYC residency requirement."
  ],
  "missingFields": [
    "insuranceEligibility"
  ],
  "source": {
    "name": "NYC Care",
    "url": "official-source-url",
    "lastVerified": "YYYY-MM-DD"
  }
}
```

---

# Program Validator Interface

Each benefit program should be implemented independently.

Example:

```typescript
export interface ProgramValidator {
  programId: string;
  programName: string;

  validate(
    input: EligibilityInput
  ): EligibilityResult;
}
```

Recommended files:

```text
eligibility/
├── types.ts
├── normalizeProfile.ts
├── eligibilityEngine.ts
├── sources.ts
├── programs/
│   ├── fairFares.ts
│   ├── idnyc.ts
│   └── nycCare.ts
└── formPayload/
    ├── types.ts
    ├── mappings.ts
    └── generateFormPayload.ts
```

Adapt to the existing repository layout.

Do not reorganize unrelated teammate folders.

---

# Fair Fares NYC

Validate only verified criteria.

Expected categories include:

```text
NYC residency
Age
Household size
Household income
Transportation assistance/disqualifier inputs
```

Do not place income-threshold math directly inside UI components.

Store current verified thresholds in a dedicated configuration or rule file.

Example:

```typescript
export const fairFaresIncomeLimits = {
  // populate only from verified official source
};
```

Create a helper:

```typescript
getFairFaresIncomeLimit(householdSize)
```

If a required field is missing:

```text
status = needs_more_information
```

If a known rule fails:

```text
status = likely_not_eligible
```

If all known required rules pass:

```text
status = potentially_eligible
```

---

# IDNYC

Validate core verified criteria such as:

```text
NYC residency
Minimum age
```

Keep program eligibility separate from application-document readiness.

For example:

```text
Program eligibility
!=
Application ready
```

Document-point requirements should be handled separately if added later.

Do not mix ID document scoring into the initial core eligibility engine unless explicitly requested.

---

# NYC Care

Validate only verified criteria.

Potential categories include:

```text
NYC residency
Health insurance eligibility status
Affordability-related requirements
```

This program may often return:

```text
needs_more_information
```

if health-insurance eligibility is unknown.

Do not automatically reject someone only because they currently have a health-insurance-related field unless the official rule clearly supports that interpretation.

---

# Eligibility Engine

Create a main function:

```typescript
checkEligibility(profile)
```

Example behavior:

```typescript
export function checkEligibility(
  profile: MockUserProfile
): EligibilityResult[] {
  const input =
    normalizeProfileForEligibility(profile);

  return [
    validateFairFares(input),
    validateIDNYC(input),
    validateNYCCare(input),
  ];
}
```

Do not embed the rules directly into this function.

Keep each program validator separate.

---

# Example Eligibility Output

For a mock profile, the engine may return:

```json
{
  "results": [
    {
      "programId": "fair_fares",
      "programName": "Fair Fares NYC",
      "status": "potentially_eligible",
      "reasons": [],
      "missingFields": []
    },
    {
      "programId": "idnyc",
      "programName": "IDNYC",
      "status": "potentially_eligible",
      "reasons": [],
      "missingFields": []
    },
    {
      "programId": "nyc_care",
      "programName": "NYC Care",
      "status": "needs_more_information",
      "reasons": [],
      "missingFields": [
        "insuranceEligibility"
      ]
    }
  ]
}
```

---

# Form-Fill Output

The validator must also support a second output for a separate automatic form-filling system.

Do not send the raw internal profile directly.

Create a standardized payload.

---

# Form-Fill Payload Type

Use a structure similar to:

```typescript
export interface FormFieldValue {
  value:
    | string
    | number
    | boolean
    | null;

  source: string;

  confirmed: boolean;
}

export interface FormFillPayload {
  programId: string;

  applicantId: string;

  eligibilityStatus: EligibilityStatus;

  fields: Record<
    string,
    FormFieldValue
  >;

  missingFields: string[];

  readyForPreview: boolean;
}
```

---

# Form Field Mapping

Keep mappings outside the validator.

Example:

```typescript
export const fairFaresFormMapping = {
  first_name: "identity.firstName",
  last_name: "identity.lastName",
  date_of_birth: "identity.dateOfBirth",

  street_address: "residence.street",
  city: "residence.city",
  state: "residence.state",
  zip_code: "residence.zipCode",

  email: "contact.email",
  phone: "contact.phone",

  household_size:
    "household.householdSize",

  annual_income:
    "household.annualIncome",
};
```

The mapping layer should translate:

```text
Canonical User Profile
      ↓
Government Form Field Names
```

Do not combine mapping logic with eligibility rules.

---

# Form Payload Generator

Create:

```typescript
generateFormPayload(
  profile,
  programId,
  eligibilityResult
)
```

The function should:

1. Select the mapping for the chosen program.
2. Read values from the canonical profile.
3. Generate normalized form field entries.
4. Include source paths.
5. Track missing form fields.
6. Determine whether the form is ready for preview.

Example:

```json
{
  "programId": "fair_fares",
  "applicantId": "user_001",
  "eligibilityStatus": "potentially_eligible",
  "fields": {
    "first_name": {
      "value": "Alex",
      "source": "identity.firstName",
      "confirmed": true
    },
    "last_name": {
      "value": "Sharma",
      "source": "identity.lastName",
      "confirmed": true
    },
    "household_size": {
      "value": 1,
      "source": "household.householdSize",
      "confirmed": true
    }
  },
  "missingFields": [],
  "readyForPreview": true
}
```

---

# Separation of Responsibilities

Keep these responsibilities independent.

```text
Authentication
    ↓
Returns User/Profile

Validation System
    ↓
Checks Eligibility

Form Payload System
    ↓
Maps Data

Form Automation
    ↓
Handled by another teammate
```

This workstream stops before actual form automation.

Do not implement:

```text
Playwright
Puppeteer
PDF injection
Web-form submission
Agent browser automation
```

unless explicitly requested later.

---

# Source Metadata

Create a source registry.

Example:

```typescript
export const PROGRAM_SOURCES = {
  fair_fares: {
    name: "Official NYC Source",
    url: "",
    lastVerified: ""
  },

  idnyc: {
    name: "Official NYC Source",
    url: "",
    lastVerified: ""
  },

  nyc_care: {
    name: "Official NYC Source",
    url: "",
    lastVerified: ""
  }
};
```

Populate this only with verified official sources.

Do not fabricate URLs.

---

# Validation Rules

Validate basic data quality before checking eligibility.

Examples:

```text
Date of birth is valid
Household size >= 1
Annual income >= 0
State is present
ZIP code is present
Required boolean/enum fields use expected values
```

Use existing validation libraries if already installed.

Do not add a large dependency solely for simple checks.

---

# Error Handling

Differentiate:

```text
Invalid profile data
Missing eligibility information
Program rule failure
Unknown program
Form mapping missing
```

Do not crash the app because one program has incomplete information.

A single program failure should not prevent other program results from being generated.

---

# Test Cases

Create at least these mock validation scenarios.

## Scenario 1

```text
NYC resident
Valid age
Low income
No transportation disqualifier
```

Expected:

```text
Fair Fares → potentially eligible
IDNYC → potentially eligible
NYC Care → depends on insurance information
```

---

## Scenario 2

```text
NYC resident
Income above Fair Fares threshold
```

Expected:

```text
Fair Fares → likely not eligible
IDNYC → potentially eligible
```

---

## Scenario 3

```text
Lives outside NYC
```

Expected:

```text
NYC-residency-dependent programs
→ likely not eligible
```

---

## Scenario 4

```text
NYC resident
Required insurance field missing
```

Expected:

```text
NYC Care
→ needs more information
```

---

# Team Safety

This repository is being developed by multiple teammates.

Before changing anything:

1. Inspect the current file.
2. Check whether an equivalent implementation already exists.
3. Reuse existing profile types where possible.
4. Do not rename teammate folders.
5. Do not rewrite unrelated screens.
6. Do not change authentication unless absolutely required for integration.
7. Do not implement form automation.
8. Keep changes focused on validation and payload generation.

---

# First Task for Codex

Start with this exact task:

```text
Inspect the repository and implement only the validation/eligibility workstream.

1. Find the existing mock user/profile structure.
2. Reuse existing types where possible.
3. Create normalized eligibility input logic.
4. Create common eligibility result types.
5. Create validators for:
   - Fair Fares NYC
   - IDNYC
   - NYC Care
6. Use only verified source-backed criteria.
7. Create a main eligibility engine.
8. Generate structured eligibility output.
9. Create a separate form-fill payload type.
10. Create a reusable form-field mapping layer.
11. Generate one form-ready payload for the selected program.
12. Add tests or mock scenarios.
13. Do not modify unrelated teammate features.
14. Stop once validation and payload generation work.
```

---

# Acceptance Criteria

The workstream is complete when:

- [ ] Existing mock user data can be passed into the validator.
- [ ] User data is normalized before eligibility checks.
- [ ] PII is minimized in eligibility input.
- [ ] Fair Fares validator works.
- [ ] IDNYC validator works.
- [ ] NYC Care validator works.
- [ ] Each result includes status.
- [ ] Each result includes reasons.
- [ ] Each result includes missing fields.
- [ ] Each result includes official source metadata.
- [ ] Missing information does not automatically become a rejection.
- [ ] Eligibility logic is separate from UI.
- [ ] Eligibility logic is separate from form mapping.
- [ ] Form payload generation works.
- [ ] Form payload identifies missing form fields.
- [ ] No actual government submission is implemented.
- [ ] No LLM is used as the source of truth for eligibility.
- [ ] Unrelated teammate code remains untouched.

---

# Final Output to Report

After implementation, report:

1. Files created
2. Files modified
3. Eligibility rules implemented
4. Official sources used
5. Mock scenarios tested
6. Example eligibility JSON output
7. Example form-fill JSON output
8. Any required inputs still missing
9. Integration instructions for the teammate handling form automation

Then stop and wait for the next instruction.
