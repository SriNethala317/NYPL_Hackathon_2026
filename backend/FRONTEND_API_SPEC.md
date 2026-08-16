# Frontend API specification

## Local setup

```bash
cd backend
npm install
npm run dev
```

The backend listens on `http://localhost:3001` by default. Build/type-check with `npm run build`; start without watch mode with `npm start`.

Configure Expo with the non-secret API URL:

```text
EXPO_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1
```

Expo `EXPO_PUBLIC_*` values are visible in the client bundle. Never place Gemini keys, NYC tokens, or backend secrets there.

## Local CORS

The backend allows these origins by default:

```text
http://localhost:8081
http://127.0.0.1:8081
```

Override them with the backend-only comma-separated `FRONTEND_ORIGIN` setting:

```text
FRONTEND_ORIGIN=http://localhost:8081,http://127.0.0.1:8081
```

## Response envelope

```ts
interface ApiSuccess<T> { success: true; data: T; }
interface ApiError { success: false; error: { code: string; message: string; fields?: string[] }; }
```

## Health check

```http
GET /api/v1/health
```

```json
{ "success": true, "data": { "status": "ok" } }
```

## Discover benefits

```http
POST /api/v1/benefits/discover
Content-Type: application/json
```

```json
{ "profile": { "id": "demo_user_001", "residence": { "city": "New York", "state": "NY" } } }
```

```json
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "programId": "p007en",
        "programName": "Supplemental Nutrition Assistance Program",
        "discoveryStatus": "possible_match",
        "relevanceScore": 91,
        "detailedValidationSupported": false,
        "formAutomationSupported": false,
        "metadataSource": "live_nyc_dataset",
        "discoverySource": "gemini_catalog_match"
      }
    ]
  }
}
```

`discoveryStatus` is relevance only, never official eligibility. Render `relevanceScore` only as an optional ranking signal. Enable “Check details” when `detailedValidationSupported` is true. Enable form preparation only after detailed validation is potentially eligible and `formAutomationSupported` is true.

## Validate a selected program

```http
POST /api/v1/benefits/:programId/validate
```

Supported IDs: `fair_fares`, `idnyc`, and `nyc_care`.

```json
{ "profile": { "id": "demo_user_001", "identity": { "dateOfBirth": "2002-09-01" } } }
```

```json
{
  "success": true,
  "data": {
    "result": {
      "programId": "fair_fares",
      "programName": "Fair Fares NYC",
      "status": "needs_more_information",
      "reasons": [],
      "missingFields": ["nycResident", "householdSize", "annualIncome", "receivesFullCarfare", "receivesTransportationDiscount"],
      "source": { "name": "Fair Fares NYC", "url": "https://www.nyc.gov/site/fairfares/", "lastVerified": "2026-08-15" }
    }
  }
}
```

Handle statuses as follows:

- `potentially_eligible`: allow form preparation when supported; it is not official approval.
- `needs_more_information`: ask only for `missingFields`, update the canonical profile, then validate again.
- `likely_not_eligible`: show `reasons`; never label this as an official denial.

## Generate a form payload

```http
POST /api/v1/forms/:programId/payload
Content-Type: application/json
```

The route does not recalculate eligibility. Pass the detailed result returned from the validate endpoint.

```json
{
  "profile": { "id": "demo_user_001" },
  "eligibilityResult": {
    "programId": "fair_fares",
    "programName": "Fair Fares NYC",
    "status": "potentially_eligible",
    "reasons": [],
    "missingFields": [],
    "source": { "name": "Fair Fares NYC", "url": "https://www.nyc.gov/site/fairfares/", "lastVerified": "2026-08-15" }
  }
}
```

```json
{
  "success": true,
  "data": {
    "payload": {
      "programId": "fair_fares",
      "applicantId": "demo_user_001",
      "eligibilityStatus": "potentially_eligible",
      "fields": {
        "first_name": { "value": "Demo", "source": "identity.firstName", "confirmed": true }
      },
      "missingFields": [],
      "readyForPreview": true
    }
  }
}
```

Each field's `source` is a canonical profile path, not a DOM/PDF selector. `confirmed` is true only after that source path appears in `profile.confirmedFields`. The automation team maps semantic keys such as `first_name` to actual selectors.

## Errors

```json
{
  "success": false,
  "error": {
    "code": "DETAILED_VALIDATION_NOT_SUPPORTED",
    "message": "Detailed validation is not supported for program: snap."
  }
}
```

Implemented codes: `INVALID_REQUEST`, `INVALID_PROFILE`, `PROGRAM_NOT_SUPPORTED`, `DETAILED_VALIDATION_NOT_SUPPORTED`, `FORM_AUTOMATION_NOT_SUPPORTED`, `MISSING_INFORMATION`, and `INTERNAL_ERROR`.

## Minimal Expo client example

```ts
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';

async function callApi<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(payload.error?.message ?? 'API request failed.');
  return payload.data as T;
}

export const benefitsApi = {
  discover: (profile: ClientUserProfile) => callApi<{ recommendations: BenefitRecommendation[] }>('/benefits/discover', { profile }),
  validateProgram: (programId: string, profile: ClientUserProfile) => callApi<{ result: EligibilityResult }>(`/benefits/${programId}/validate`, { profile }),
  generateFormPayload: (programId: string, profile: ClientUserProfile, eligibilityResult: EligibilityResult) => callApi<{ payload: FormFillPayload }>(`/forms/${programId}/payload`, { profile, eligibilityResult }),
};
```

Use the contract interfaces in `FRONTEND_INTEGRATION.md`; no frontend API client is added by this backend work.

## Recommended frontend flow

```text
Collect/load canonical profile
  -> POST /benefits/discover
  -> display relevance recommendations
  -> user selects a program
  -> if detailedValidationSupported: POST /benefits/:id/validate
  -> if needs_more_information: ask only missing fields and validate again
  -> if potentially_eligible and formAutomationSupported: POST /forms/:id/payload
  -> pass preview-ready semantic payload to the automation flow
```

For the fictional demo profile, the flow is: discover recommendations, select Fair Fares, validate `fair_fares`, then submit the returned detailed result with the same profile to `/forms/fair_fares/payload`.

## Privacy and limitations

```text
Frontend -> canonical profile -> our backend
Backend -> privacy-safe derived context -> Gemini (optional)
Backend -> catalog request -> NYC Open Data
```

The frontend never calls Gemini directly and must not copy backend secrets into Expo environment variables. Broad results are catalog/Gemini-assisted relevance recommendations, not official screening determinations. NYC Screening API access is not connected. Deep validation is limited to Fair Fares, IDNYC, and NYC Care. This API prepares semantic form payloads only; it does not submit government forms.
