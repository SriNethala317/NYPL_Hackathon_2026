# IDNYC Form Requirements

This document describes the current handoff from the benefits backend to `Forms/IDNYCForm.pdf`. It is derived from the template's 32 page-one AcroForm fields and the existing `fillIdNycForm()` mapping. It is not a statement of official IDNYC eligibility or submission requirements.

## Completion contract

The backend first produces a confirmed `FormFillPayload` for the existing identity, address, email, and phone fields. The frontend then calls the domain completion check with `IdNycSupplementalInput` to receive unresolved questions. The adapter only accepts the payload once every additional required question has an explicit answer.

```ts
checkIdNycFormCompletion(payload, supplementalData)
toIdNycAutomationInput(payload, supplementalData)
```

The latter throws `FORM_INPUT_INCOMPLETE` when required form-specific values are unresolved. It never assumes an application type, physical descriptor, borough, or signature.

## AcroForm field coverage

| PDF field(s) | Meaning | Data source | Classification | Automation status |
| --- | --- | --- | --- | --- |
| `1` | Existing IDNYC number | `idnycNumber` (not yet modeled) | Conditional: renewal | Unsupported; complete manually for renewal |
| `2`–`6` | Application type | `supplemental.applicationType` | Required | Filled |
| `7`, `9` | First, last name | Form payload `first_name`, `last_name` | Required base payload | Filled |
| `8` | Middle name | `supplemental.middleName` | Optional | Filled when supplied |
| `10`–`12` | Date of birth | Form payload `date_of_birth` | Required base payload | Filled |
| `13` | Eye color | `supplemental.eyeColor` | Required | Filled |
| `14`, `15` | Height feet/inches | `supplemental.heightFeet`, `heightInches` | Required | Filled |
| `16` | Gender | `supplemental.gender` | Required | Filled |
| `17`, `18`–`20` | Email, phone | Form payload `email`, `phone` | Required base payload | Filled |
| `21` | Preferred language | `supplemental.languagePreference` | Optional | Filled when supplied |
| `22` | Veteran designation | `supplemental.veteranDesignation` | Optional | Filled only when true |
| `23` | Donate Life election | `supplemental.organDonor` | Optional | Filled only when true; signature remains manual |
| `24`, `26`, `27` | Street, city, ZIP | Form payload | Required base payload | Filled |
| `25` | Unit/floor/suite/room | `supplemental.apartmentUnit` | Optional | Filled when supplied |
| `28` | Borough | `supplemental.borough` | Required | Filled |
| `29`, `30`–`32` | Emergency contact name/phone | `supplemental.emergencyContact` | Optional | Filled when both values are supplied |

The template's state is preprinted as New York and has no AcroForm control. `state` in the existing payload is therefore intentionally unused by this PDF automation.

## Manual-only fields

The automation does not generate signatures or date an application. The user must review the generated PDF and complete:

- applicant signature;
- application date;
- organ-donor signature when an organ-donor election is made.

These manual tasks are returned by `FormCompletionCheck.manualFields`; they do not become automated values.

## Frontend question behavior

`FormQuestion` is the API-ready presentation contract. The frontend should request only `requiredQuestions` before enabling PDF generation. It may offer `optionalQuestions` without blocking generation. If a renewal is selected, the completion check reports `idnyc_number` as unsupported; the user must enter it manually in the generated PDF until the filler has explicit support.

The frontend must never use AI or defaults to fill these values. All supplemental values are user-entered and should be explicitly confirmed before they are retained.

## Example supplemental input

```ts
const supplemental: IdNycSupplementalInput = {
  applicationType: 'new',
  eyeColor: 'brown',
  heightFeet: 5,
  heightInches: 8,
  gender: 'notDesignated',
  borough: 'manhattan',
};
```

This is form-specific data. It must not cause the canonical benefits profile or `FormFillPayload` schema to be renamed or expanded solely for this PDF.
