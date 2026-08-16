# Form automation integration contract

## 1. Purpose

This document defines the handoff from the validation backend to the current PDF form-filling implementation on branch `prest-file` (commit `1673f9d`). It is an inspection contract only; no adapter is implemented here.

```text
Canonical User Profile (camelCase nested paths)
  -> FormFillPayload (snake_case semantic keys)
  -> IDNYC automation adapter (required)
  -> Automation Profile + PDF field IDs
  -> filled PDF bytes
```

The backend contract remains authoritative for canonical profile paths. Form automation owns only the final translation from semantic data to PDF fields.

## 2. Current automation implementation

| Item | Actual implementation |
| --- | --- |
| Inspected branch | `prest-file` / `origin/prest-file` |
| Technology | `pdf-lib` (`PDFDocument`, AcroForm fields) |
| Entrypoint | `src/features/documents/fill-idnyc-form.ts` |
| Target asset | `Forms/IDNYCForm.pdf` |
| Target form | IDNYC PDF only |
| Output | `Promise<Uint8Array>` containing filled PDF bytes |
| Browser/PDF selector technology | PDF AcroForm field IDs, not browser selectors |
| Preview generation | Not implemented; caller receives bytes only |
| Browser automation | Not implemented |

The branch exports `fillIdNycForm(sourcePdfBytes, profile, options)`. It leaves values blank when optional values are absent; it does not invent applicant data.

## 3. Existing backend handoff contract

The backend produces:

```ts
export interface FormFillPayload {
  programId: string;
  applicantId: string;
  eligibilityStatus: 'potentially_eligible' | 'needs_more_information' | 'likely_not_eligible';
  fields: Record<string, {
    value: string | number | boolean | null;
    source: string; // canonical path, never a selector
    confirmed: boolean;
  }>;
  missingFields: string[];
  readyForPreview: boolean;
}
```

The only currently relevant backend mapping for this branch is `programId: "idnyc"`:

```text
first_name, last_name, date_of_birth, street_address, city,
state, zip_code, email, phone
```

## 4. Existing automation input contract

The automation branch does **not** consume `FormFillPayload`. It expects this `Profile` object:

```ts
interface Profile {
  name: { first: string; middle?: string; last: string };
  dateOfBirth: string;
  address: { street: string; unit?: string; city: string; zip: string; borough?: Borough };
  eyeColor?: 'brown' | 'hazel' | 'black' | 'blue' | 'green' | 'gray' | 'multiColor';
  heightInches?: number;
  gender?: 'female' | 'male' | 'notDesignated';
  email?: string;
  phone?: string; // digits are normalized/split by automation
  languagePreference?: string;
  isVeteran?: boolean;
  organDonorOptIn?: boolean;
  emergencyContact?: { name: string; phone: string };
}
```

`FillIdNycFormOptions` supplies an independent `applicationType` with `new`, `reapplication`, `renewal`, `updateCard`, or `replaceCard`; it defaults to `new`.

### Automation input fields and actual PDF controls

| Automation input | Type | Type-required? | PDF field ID(s) | Current fill behavior |
| --- | --- | --- | --- | --- |
| `name.first` | string | Yes | `7` | Filled |
| `name.middle` | string | Optional | `8` | Filled when supplied |
| `name.last` | string | Yes | `9` | Filled |
| `dateOfBirth` | ISO string | Yes | `10`, `11`, `12` | Split to month/day/year when valid |
| `eyeColor` | union | Optional | `13` radio | Filled when supplied |
| `heightInches` | number | Optional | `14`, `15` | Converted to feet/inches |
| `gender` | union | Optional | `16` radio | Filled when supplied |
| `email` | string | Optional | `17` | Filled |
| `phone` | string | Optional | `18`, `19`, `20` | Digits normalized and split only if 10 digits |
| `languagePreference` | string | Optional | `21` | Filled |
| `isVeteran` | boolean | Optional | `22` checkbox | Checked only when true |
| `organDonorOptIn` | boolean | Optional | `23` checkbox | Checked only when true |
| `address.street` | string | Yes | `24` | Filled |
| `address.unit` | string | Optional | `25` | Filled when supplied |
| `address.city` | string | Yes | `26` | Filled |
| `address.zip` | string | Yes | `27` | Filled |
| `address.borough` | union | Optional | `28` radio | Filled when supplied |
| `emergencyContact.name` | string | Optional | `29` | Filled when supplied |
| `emergencyContact.phone` | string | Optional | `30`, `31`, `32` | Digits normalized and split only if 10 digits |
| `options.applicationType` | union | Optional; defaults `new` | `2`–`6` checkbox | Always checks chosen/default value |

`IdNycFormField.idnycNumber` maps to PDF field `1`, but the current `fillIdNycForm()` function does not consume or fill it.

## 5. Field mapping matrix

### Backend IDNYC semantic keys to automation input

All nine backend fields require an adapter because the automation function accepts `Profile`, not `FormFillPayload.fields`.

| Canonical path | Backend semantic key | Automation input | PDF field ID(s) | Status |
| --- | --- | --- | --- | --- |
| `identity.firstName` | `first_name` | `name.first` | `7` | ADAPTER REQUIRED |
| `identity.lastName` | `last_name` | `name.last` | `9` | ADAPTER REQUIRED |
| `identity.dateOfBirth` | `date_of_birth` | `dateOfBirth` | `10`, `11`, `12` | ADAPTER REQUIRED; automation splits ISO date |
| `residence.street` | `street_address` | `address.street` | `24` | ADAPTER REQUIRED |
| `residence.city` | `city` | `address.city` | `26` | ADAPTER REQUIRED |
| `residence.state` | `state` | — | preprinted NY, no PDF field | UNUSED by current IDNYC PDF automation |
| `residence.zipCode` | `zip_code` | `address.zip` | `27` | ADAPTER REQUIRED |
| `contact.email` | `email` | `email` | `17` | ADAPTER REQUIRED |
| `contact.phone` | `phone` | `phone` | `18`, `19`, `20` | ADAPTER REQUIRED; automation normalizes 10 digits |

### Automation inputs absent from the backend IDNYC payload

| Automation input / PDF field | Backend status | Notes |
| --- | --- | --- |
| `name.middle` / `8` | MISSING FROM BACKEND | No canonical middle-name field currently exists |
| `address.unit` / `25` | MISSING FROM BACKEND | No canonical unit/apartment field currently exists |
| `address.borough` / `28` | AVAILABLE IN PROFILE, MISSING FROM IDNYC PAYLOAD | Canonical `residence.borough` exists but is not part of current IDNYC mapping |
| `eyeColor` / `13` | MISSING FROM BACKEND | Not in canonical profile |
| `heightInches` / `14`, `15` | MISSING FROM BACKEND | Not in canonical profile |
| `gender` / `16` | MISSING FROM BACKEND | Not in canonical profile |
| `languagePreference` / `21` | MISSING FROM BACKEND | Not in canonical profile |
| `isVeteran` / `22` | MISSING FROM BACKEND | Not in canonical profile |
| `organDonorOptIn` / `23` | MISSING FROM BACKEND | Not in canonical profile |
| `emergencyContact` / `29`–`32` | MISSING FROM BACKEND | Not in canonical profile |
| IDNYC card number / `1` | UNSUPPORTED BY CURRENT FILLER | Field map exists; fill function does not use it |
| application type / `2`–`6` | ADAPTER OPTION REQUIRED | Backend profile/payload currently has no application type |

## 6. Supported form readiness

| Form/program | Automation readiness | Evidence |
| --- | --- | --- |
| IDNYC | Partially supported | PDF field IDs and `pdf-lib` filler exist. Backend covers 8 of 9 meaningful backend payload fields; `state` is intentionally unused because NY is preprinted. Multiple IDNYC PDF fields have no canonical backend source. |
| Fair Fares | Blocked | No Fair Fares automation implementation, PDF mapping, or target found on `prest-file`. |
| NYC Care | Blocked | No NYC Care automation implementation, PDF mapping, or target found on `prest-file`. |

## 7. Required fields and safety gate

The current automation function itself does not inspect `readyForPreview`, `confirmed`, or `missingFields`. It accepts `Profile` and fills whatever values are present.

The integration boundary should enforce the existing backend gate **before** calling automation:

```ts
if (payload.programId !== 'idnyc' || !payload.readyForPreview) {
  // Do not call fillIdNycForm.
}

if (Object.values(payload.fields).some((field) => !field.confirmed)) {
  // Do not call fillIdNycForm.
}
```

This recommendation does not change current automation behavior. It uses existing backend contract fields to prevent unconfirmed or incomplete information from reaching a government-form filler.

When `payload.missingFields` is non-empty, the frontend must ask the user, update the canonical profile, add confirmed canonical paths after review, and request a fresh payload. Automation must not infer or fabricate missing information.

## 8. Minimal adapter specification

Direct integration is not possible because the two systems accept different shapes. The minimal future adapter is IDNYC-specific:

```ts
function toIdNycAutomationInput(
  payload: FormFillPayload,
): { profile: Profile; options: FillIdNycFormOptions };
```

Adapter responsibilities:

1. Reject a non-IDNYC payload, `readyForPreview === false`, missing fields, or unconfirmed fields.
2. Read only `payload.fields` semantic keys; do not re-read the canonical profile or recalculate eligibility.
3. Transform only boundary names: `first_name` → `name.first`, `street_address` → `address.street`, and so on.
4. Pass `date_of_birth` as ISO text and phone as text; existing automation performs date splitting and phone digit normalization.
5. Leave currently unsupported PDF fields blank rather than inventing data.
6. Accept an explicit UI-supplied application type only when a future canonical/adapter input is defined; otherwise use the automation default `new`.

### Machine-friendly future mapping proposal

This mirrors existing PDF field IDs; it is not implemented code.

```ts
const IDNYC_AUTOMATION_MAPPING = {
  first_name: { canonicalPath: 'identity.firstName', automationPath: 'name.first', pdfFieldIds: ['7'] },
  last_name: { canonicalPath: 'identity.lastName', automationPath: 'name.last', pdfFieldIds: ['9'] },
  date_of_birth: { canonicalPath: 'identity.dateOfBirth', automationPath: 'dateOfBirth', pdfFieldIds: ['10', '11', '12'] },
  street_address: { canonicalPath: 'residence.street', automationPath: 'address.street', pdfFieldIds: ['24'] },
  city: { canonicalPath: 'residence.city', automationPath: 'address.city', pdfFieldIds: ['26'] },
  zip_code: { canonicalPath: 'residence.zipCode', automationPath: 'address.zip', pdfFieldIds: ['27'] },
  email: { canonicalPath: 'contact.email', automationPath: 'email', pdfFieldIds: ['17'] },
  phone: { canonicalPath: 'contact.phone', automationPath: 'phone', pdfFieldIds: ['18', '19', '20'] },
} as const;
```

`state` is deliberately absent: the current PDF preprints New York rather than exposing a fillable state control.

## 9. Fictional payload and transformed automation input

### Backend payload excerpt

```json
{
  "programId": "idnyc",
  "applicantId": "demo_user_001",
  "eligibilityStatus": "potentially_eligible",
  "fields": {
    "first_name": { "value": "Demo", "source": "identity.firstName", "confirmed": true },
    "last_name": { "value": "Student", "source": "identity.lastName", "confirmed": true },
    "date_of_birth": { "value": "2002-09-01", "source": "identity.dateOfBirth", "confirmed": true },
    "street_address": { "value": "99 Fictional Avenue", "source": "residence.street", "confirmed": true },
    "city": { "value": "New York", "source": "residence.city", "confirmed": true },
    "zip_code": { "value": "10001", "source": "residence.zipCode", "confirmed": true },
    "email": { "value": "demo.student@example.test", "source": "contact.email", "confirmed": true },
    "phone": { "value": "212-555-0100", "source": "contact.phone", "confirmed": true }
  },
  "missingFields": [],
  "readyForPreview": true
}
```

### Adapter output expected by current PDF filler

```ts
{
  profile: {
    name: { first: 'Demo', last: 'Student' },
    dateOfBirth: '2002-09-01',
    address: { street: '99 Fictional Avenue', city: 'New York', zip: '10001' },
    email: 'demo.student@example.test',
    phone: '212-555-0100',
  },
  options: { applicationType: 'new' },
}
```

Trace examples:

```text
identity.firstName -> fields.first_name -> profile.name.first -> PDF field 7
identity.dateOfBirth -> fields.date_of_birth -> profile.dateOfBirth -> PDF fields 10/11/12
residence.street -> fields.street_address -> profile.address.street -> PDF field 24
household.annualIncome -> no current IDNYC semantic key -> no current IDNYC PDF target
```

## 10. Integration API boundary

Recommended current flow:

```text
Frontend
  -> POST /api/v1/benefits/idnyc/validate
  -> POST /api/v1/forms/idnyc/payload
  -> frontend or future trusted automation service applies toIdNycAutomationInput
  -> fillIdNycForm(blankPdfBytes, profile, options)
  -> filled PDF bytes
  -> preview/download flow (not yet implemented by automation branch)
```

Do not send the canonical profile directly to automation. The payload is the approved semantic handoff. A future server-side automation service is preferable for government-form processing, but no transport/service decision is implemented here.

## 11. Team responsibilities

| Team | Responsibility |
| --- | --- |
| Validation Backend | Produce accurate `FormFillPayload`; preserve canonical paths, confirmation status, and readiness gate. |
| Frontend | Collect missing data, obtain user confirmation, call payload API, and prevent fill initiation until payload is ready. |
| Form Automation | Implement the narrow IDNYC adapter, map semantic fields to existing PDF IDs, keep unsupported PDF fields blank, return/render PDF bytes. |

## 12. Known gaps

- Automation supports IDNYC PDF only; Fair Fares and NYC Care are not automated.
- Current automation input differs from `FormFillPayload`; an adapter is required.
- IDNYC PDF fields for middle name, unit, borough, physical descriptors, preferences, donor/veteran, emergency contact, and application type are not fully represented by the canonical backend payload.
- `residence.borough` exists canonically but is omitted from current IDNYC form payload mapping.
- The current filler has no IDNYC number handling despite field ID `1` being mapped.
- The automation branch returns filled bytes but provides no preview/render or submission behavior.
