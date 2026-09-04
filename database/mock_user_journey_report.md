# End-to-end mock user journey — real systems, real output

Every request/response pair below is real: run against the live Supabase project
(`iubzcpjinvsqsvrmqlvx`) and a real `backend/` server (`npx tsx src/server.ts`, port 3001, default
config — `LIVE_BENEFITS_CATALOG=true`, `GEMINI_ENABLED=false`). Nothing here is a fabricated
request/response pair. One step failed on the first attempt for a real reason (see Step 9) and is
reported as it actually happened, then retried with a labeled workaround.

**Persona**: Jordan Kim (fictional) — NYC resident, student, low income. Chosen because the
programId-mismatch fix verified in the previous session already confirmed this profile shape
resolves through the full discover → validate → payload chain for Fair Fares.

## Step 0 — real type definitions read first

Read in full: `src/data/profile-fields.ts` (`ProfileFieldKey = 'fullName' | 'dob' | 'address' |
'household' | 'income'`, plus which `DocumentTypeId`s each is extractable from and whether it's
`timeVarying`), `src/data/document-types.ts` (`DocumentTypeId`s and `fieldAuthority` — the
per-field trust order used to break ties), and `src/data/reconcile.ts` (`FieldCandidate`,
`ResolvedField`, `resolveField`, `reconcile`). All mock values below use only these real types.

**A constraint discovered immediately**: `src/features/backend/*` (`ensureSession`,
`ensureApplicant`, `saveDocument`, `loadProfile`, `deleteMyData`) cannot run outside the Expo/React
Native runtime — confirmed by actually trying:

```
$ npx tsx try-import.mts   # imports src/features/backend/auth.ts
Error: Transform failed with 1 error:
node_modules/react-native/index.js:27:7: ERROR: Unexpected "typeof"
```

`supabase.ts` → `session-storage.ts` imports `expo-secure-store`, `@react-native-async-storage/
async-storage`, and React Native's `Platform` — none of which parse or run in plain Node. So this
journey calls the real Supabase REST/Auth API directly (same project, same anon key, same tables,
same RLS policies the app itself uses) and replicates each function's exact documented logic —
this is a real request/response against the real live database, just not a literal in-process call
of the `.ts` function, which is architecturally impossible outside Expo. `src/data/reconcile.ts`
(and its dependencies `document-types.ts`, `profile-fields.ts`) have **no** React Native
dependency and were confirmed importable — those functions were run for real, in-process, not
replicated.

## Step 2 — `ensureSession()`

Real `POST {SUPABASE_URL}/auth/v1/signup` with an empty body (anonymous sign-in), same as the app.

```json
{ "httpStatus": 200, "userId": "351613ac-646b-48d8-9c72-720cb422326f", "anonymous": true }
```

## Step 3 — `ensureApplicant()`

Real upsert into `users` (`on_conflict=auth_user_id`), then a real lookup/insert into
`applicant_profiles`.

```json
{ "httpStatus": 201, "dbUserId": "40667424-3868-4fe5-8d92-5cfdc02ddf52", "applicantId": "1cc4394a-6123-47cf-a62b-77eff59c0145" }
```

Direct query, `SELECT * FROM applicant_profiles WHERE id = '1cc4394a-...'`:

```json
[{
  "id": "1cc4394a-6123-47cf-a62b-77eff59c0145", "user_id": "40667424-3868-4fe5-8d92-5cfdc02ddf52",
  "first_name": null, "middle_name": null, "last_name": null, "suffix": null,
  "date_of_birth": null, "gender_marker": null, "ssn_encrypted": null,
  "passport_number_encrypted": null, "nys_client_id": null, "primary_phone": null, "email": null,
  "residence_address_id": null, "mailing_address_id": null, "mailing_address_different": false,
  "preferred_language": null,
  "created_at": "2026-09-04T12:58:56.159966+00:00", "updated_at": "2026-09-04T12:58:56.159966+00:00"
}]
```

Confirmed: name/DOB and every other identity field is genuinely null at this point — nothing has
been asked yet, exactly as `applicant-bootstrap.ts`'s own comment says.

## Step 4 — first document: a state ID (identity)

**Asked**: `state_id`. **Mock OCR yielded**: `fullName = "Jordan Kim"`, `dob = "06/15/2004"` (as
printed on the ID, MM/DD/YYYY), `address = "456 W 145th St, New York, NY 10031"`.

`saveDocument()` result (real inserts):

```json
{ "extractionInsert": { "httpStatus": 201, "id": "8bc9d545-9120-4787-98ab-8583dd3fdc35" },
  "provenanceInsert": { "httpStatus": 201, "rowCount": 3 }, "ok": true }
```

Direct query, `ocr_extractions`:

```json
[{ "id": "8bc9d545-...", "source_type": "STATE_ID", "fields": { "status": "read" },
   "confidence": 0.93, "processed_at": "2026-09-02T12:58:56.047+00:00" }]
```

Direct query, `field_provenance`:

```json
[
  { "field_key": "fullName", "value_text": "Jordan Kim", "source_type": "STATE_ID", "extraction_id": "8bc9d545-...", "confidence": 0.93, "extracted_at": "2026-09-02T12:58:56.047+00:00" },
  { "field_key": "dob", "value_text": "06/15/2004", "source_type": "STATE_ID", "extraction_id": "8bc9d545-...", "confidence": 0.95, "extracted_at": "2026-09-02T12:58:56.047+00:00" },
  { "field_key": "address", "value_text": "456 W 145th St, New York, NY 10031", "source_type": "STATE_ID", "extraction_id": "8bc9d545-...", "confidence": 0.88, "extracted_at": "2026-09-02T12:58:56.047+00:00" }
]
```

## Step 5 — second document, deliberate conflict

**Asked**: `pay_stub`. **Mock OCR yielded**: `fullName = "Jordan Kimm"` (deliberately misspelled —
"Kimm" vs. "Kim"), `income = "$1,500.00"` (gross monthly).

```json
{ "extractionInsert": { "httpStatus": 201, "id": "25d6f1ba-935e-452f-a123-376ae6c2555f" },
  "provenanceInsert": { "httpStatus": 201, "rowCount": 2 }, "ok": true }
```

Direct query, `field_provenance WHERE field_key = 'fullName'` — **2 rows, not 1**:

```json
[
  { "field_key": "fullName", "value_text": "Jordan Kim", "source_type": "STATE_ID", "extraction_id": "8bc9d545-...", "confidence": 0.93, "extracted_at": "2026-09-02T12:58:56.047+00:00" },
  { "field_key": "fullName", "value_text": "Jordan Kimm", "source_type": "PAY_STUB", "extraction_id": "25d6f1ba-...", "confidence": 0.82, "extracted_at": "2026-09-04T12:58:56.27+00:00" }
]
```

Confirms `saveDocument()`'s "insert, never upsert" design is actually behaving as intended live:
the second document's disagreeing value did not overwrite the first's row.

## Step 6 — `loadProfile()`, then the real reconciliation logic

`loadProfile()`'s exact mapping, replicated against the live rows above (`applications` is empty —
nothing has ever written to that table, confirmed by the earlier audit):

```json
{
  "documents": [
    { "id": "8bc9d545-...", "kind": "state_id", "status": "read", "confidence": 0.93, "readAt": "2026-09-02T12:58:56.047+00:00" },
    { "id": "25d6f1ba-...", "kind": "pay_stub", "status": "read", "confidence": 0.9, "readAt": "2026-09-04T12:58:56.27+00:00" }
  ],
  "candidates": [
    { "field": "fullName", "value": "Jordan Kim", "documentId": "8bc9d545-...", "documentType": "state_id", "confidence": 0.93, "readAt": 1788353936047 },
    { "field": "dob", "value": "06/15/2004", "documentId": "8bc9d545-...", "documentType": "state_id", "confidence": 0.95, "readAt": 1788353936047 },
    { "field": "address", "value": "456 W 145th St, New York, NY 10031", "documentId": "8bc9d545-...", "documentType": "state_id", "confidence": 0.88, "readAt": 1788353936047 },
    { "field": "fullName", "value": "Jordan Kimm", "documentId": "25d6f1ba-...", "documentType": "pay_stub", "confidence": 0.82, "readAt": 1788526736270 },
    { "field": "income", "value": "$1,500.00", "documentId": "25d6f1ba-...", "documentType": "pay_stub", "confidence": 0.9, "readAt": 1788526736270 }
  ],
  "applications": []
}
```

Those 5 candidates were fed into the **real, imported** `resolveField`/`reconcile` from
`src/data/reconcile.ts` — not described, actually executed:

```json
resolveField('fullName', candidates) =>
{ "field": "fullName", "value": "Jordan Kim", "documentId": "8bc9d545-...",
  "documentType": "state_id", "confidence": 0.93, "conflicts": [] }
```

**What won, and why, per the actual code in `document-types.ts`/`reconcile.ts`**: `state_id` won
outright. `fieldAuthority.fullName` ranks `state_id` at index 1 and `pay_stub` at index 8 — a real,
unequal authority gap, so `better()` picks `state_id` on the first comparison (`authorityRank`
difference alone) without ever consulting recency or confidence. Notably, **`conflicts` came back
empty** — this is a real, precise finding, not the "conflict gets surfaced to the user" case a
same-authority disagreement would produce (see `round-trip.test.ts`'s two-state-IDs case for that).
`resolveField`'s `conflicts` filter only flags candidates whose `authorityRank` **equals** the
winner's; `pay_stub`'s differing rank excludes it from that filter entirely, so "Jordan Kimm" is
silently outranked, not escalated. Rule 1 (more authoritative document wins) fired; rule 4
(equal-authority disagreement is surfaced to the user) did not, because these two documents were
never equally authoritative for this field. A pay stub and a second state ID would have produced a
different, real `conflicts` entry — this combination genuinely doesn't.

## Step 7 — building the backend profile, and calling the real `/discover`

Read `backend/src/api/request-validation.ts`: `/discover` expects `{ profile: MockUserProfile }`,
which is a **different shape** from `loadProfile()`'s `PersistedProfile` — confirmed by checking
rather than assumed. Building it required several manual adapter steps, each a real, specific
disconnect between the two data models (not just format friction — each is a genuine gap with
no existing code path that bridges it):

- **`dob`**: `resolveField` returned the raw OCR string `"06/15/2004"` unmodified — `normalize()`
  in `reconcile.ts` only lowercases/trims for comparison, it never reformats. Converted by hand to
  ISO `"2004-06-15"` because `profile-validation.ts` requires `/^\d{4}-\d{2}-\d{2}$/`.
- **`address`**: `resolveField` returned one opaque string. `ProfileFieldKey` has no structured
  street/city/state/zip at all. Split by hand into `street="456 W 145th St"`, `city="New York"`,
  `state="NY"`, `zip="10031"` — then fed the zip into the real `boroughFromZip()` from
  `profile-fields.ts`, which correctly returned `"Manhattan"`.
- **`household`**: neither `state_id` nor `pay_stub` yields `household` (only `tax_return`/`lease`
  do, per `document-types.ts`). `resolveField('household', ...)` returned `null`. Per
  `profile-fields.ts`'s own note, this is "not reliably extractable" and "falls back to a one-tap
  choice" — supplied `householdSize: 1` by hand, explicitly labeled manual, not derived.
- **`income`**: `profile-fields.ts` documents this field as gross **monthly** income; backend's
  `household.annualIncome` expects an **annual** figure. Converted by hand: `1500 * 12 = 18000`.
  Nothing in either codebase performs this conversion automatically.
- **contact info**: no `ProfileFieldKey`/`DocumentTypeId` models email or phone at all. Supplied
  fictional values by hand — there is no path in this app that would ever populate them from OCR.
- **`transportation.*` / `benefits.*`**: no `ProfileFieldKey` equivalent either. These are
  user-answered directly in a real product flow, not document-extracted. Supplied by hand to match
  the persona.

The actual request body sent:

```json
{
  "id": "1cc4394a-6123-47cf-a62b-77eff59c0145",
  "identity": { "firstName": "Jordan", "lastName": "Kim", "dateOfBirth": "2004-06-15" },
  "contact": { "email": "jordan.kim@example.test", "phone": "212-555-0147" },
  "residence": { "street": "456 W 145th St", "city": "New York", "state": "NY", "zipCode": "10031", "borough": "Manhattan" },
  "household": { "householdSize": 1, "annualIncome": 18000 },
  "healthcare": { "insuranceEligibility": "unknown" },
  "transportation": { "receivesFullCarfare": false, "receivesTransportationDiscount": false },
  "benefits": { "employmentStatus": "student", "studentStatus": true },
  "confirmedFields": ["identity.firstName", "identity.lastName", "identity.dateOfBirth",
    "contact.email", "contact.phone", "residence.street", "residence.city", "residence.state",
    "residence.zipCode", "household.householdSize", "household.annualIncome",
    "transportation.receivesFullCarfare", "transportation.receivesTransportationDiscount"]
}
```

`POST /api/v1/benefits/discover` — real response (Fair Fares entry only; 35 total recommendations):

```json
{
  "httpStatus": 200, "recommendationCount": 35,
  "fairFaresEntry": {
    "programId": "p120en", "programCode": "S2R034", "programName": "Fair Fares NYC",
    "category": "Cash & expenses", "discoveryStatus": "possible_match", "relevanceScore": 44,
    "detailedValidationSupported": true, "formAutomationSupported": true,
    "discoverySource": "catalog_pre_filter", "metadataSource": "live_nyc_dataset",
    "explanationSource": "official_description"
  }
}
```

Confirmed: Fair Fares appears, `detailedValidationSupported: true` — the fix from the previous
session is what makes this true survive past discovery in the first place.

## Step 8 — validate and generate the real form payload

`POST /api/v1/benefits/p120en/validate` (the exact id discovery returned):

```json
{ "httpStatus": 200, "body": { "success": true, "data": { "result": {
  "programId": "fair_fares", "programName": "Fair Fares NYC", "status": "potentially_eligible",
  "reasons": [], "missingFields": [],
  "source": { "name": "Fair Fares NYC", "url": "https://www.nyc.gov/site/fairfares/", "lastVerified": "2026-08-15" }
}}}}
```

`POST /api/v1/forms/p120en/payload`:

```json
{ "httpStatus": 200, "body": { "success": true, "data": { "payload": {
  "programId": "fair_fares", "applicantId": "1cc4394a-6123-47cf-a62b-77eff59c0145",
  "eligibilityStatus": "potentially_eligible",
  "fields": {
    "first_name": { "value": "Jordan", "source": "identity.firstName", "confirmed": true },
    "last_name": { "value": "Kim", "source": "identity.lastName", "confirmed": true },
    "date_of_birth": { "value": "2004-06-15", "source": "identity.dateOfBirth", "confirmed": true },
    "street_address": { "value": "456 W 145th St", "source": "residence.street", "confirmed": true },
    "city": { "value": "New York", "source": "residence.city", "confirmed": true },
    "state": { "value": "NY", "source": "residence.state", "confirmed": true },
    "zip_code": { "value": "10031", "source": "residence.zipCode", "confirmed": true },
    "email": { "value": "jordan.kim@example.test", "source": "contact.email", "confirmed": true },
    "phone": { "value": "212-555-0147", "source": "contact.phone", "confirmed": true },
    "household_size": { "value": 1, "source": "household.householdSize", "confirmed": true },
    "annual_income": { "value": 18000, "source": "household.annualIncome", "confirmed": true },
    "receives_full_carfare": { "value": false, "source": "transportation.receivesFullCarfare", "confirmed": true },
    "receives_transportation_discount": { "value": false, "source": "transportation.receivesTransportationDiscount", "confirmed": true }
  },
  "missingFields": [], "readyForPreview": true
}}}}
```

## Step 9 — manual verification insert into `applications` (a real failure, then a workaround)

No code path anywhere in this repo writes to `applications` (confirmed by the earlier audit — no
fabricated endpoint call was made). This step is a manual, service-role-assisted demonstration
insert, not an exercise of real application code.

**First attempt failed, for a real reason discovered by this journey, not a scripting mistake**:

```json
// SELECT id, code FROM benefit_programs WHERE code = 'p120en'   (exact match)
{ "returnedProgramId": "p120en", "httpStatus": 200, "body": [] }
```

Zero rows. This is a **third id-casing mismatch**, distinct from the one the previous session
fixed. `benefit_programs.code` was seeded (by `scripts/push-catalogue.mjs`) verbatim from the
static catalogue's `id` field — `"P120en"`, mixed case, matching `src/data/catalogue.ts`. The live
discovery layer (`nyc-benefits-catalog.provider.ts`) lowercases `unique_id_number` before using it
as `programId` — `"p120en"`. Postgres string equality is case-sensitive, so a direct
`code = '<discovery id>'` lookup silently finds nothing, even though the row exists. The
`program-id-resolver.ts` fix from the previous session does not help here either — it resolves
`"p120en"` to the literal `fair_fares` scheme, not to the differently-cased `benefit_programs.code`
value. Confirmed directly against the database:

```sql
SELECT id, code FROM benefit_programs WHERE code ILIKE 'p120en';
-- code: "P120en", id: "3bacf07d-86a7-4b92-a6db-3835830f6202"
```

The row is there — under a different case than what discovery returns. **Worked around** (not
fixed — that's separate follow-up work) with a case-insensitive lookup purely so this
demonstration could proceed:

```json
{ "returnedProgramId": "p120en", "benefitProgramId": "3bacf07d-86a7-4b92-a6db-3835830f6202",
  "actualStoredCode": "P120en", "httpStatus": 200 }
```

`form_versions` also had **zero rows anywhere in the project** and no client-role INSERT policy
(only `form_versions_public_read`) — another real, previously undocumented gap. Created one
manually via the service-role key (same posture as `scripts/push-catalogue.mjs` — a local script
step, never the app) purely as a prerequisite so `applications.form_version_id`'s `NOT NULL`
foreign key could be satisfied at all:

```json
{ "httpStatus": 201, "body": [{ "id": "08b01311-73b2-4e9e-ad76-d6b7315f5320",
  "benefit_program_id": "3bacf07d-86a7-4b92-a6db-3835830f6202", "version_number": 1,
  "effective_from": "2026-09-04", "effective_to": null }] }
```

**The actual manual verification insert**, using the real `applicant_id` and the real payload from
step 8, via the anonymous session's own token (RLS: `applications_insert ... WITH CHECK
(applicant_id = current_applicant_id())` — no service role needed for this one):

```json
{ "httpStatus": 201, "body": [{
  "id": "605fbd57-a454-4afc-bf3e-c15705d9a19b",
  "applicant_id": "1cc4394a-6123-47cf-a62b-77eff59c0145",
  "benefit_program_id": "3bacf07d-86a7-4b92-a6db-3835830f6202",
  "form_version_id": "08b01311-73b2-4e9e-ad76-d6b7315f5320",
  "status": "DRAFT",
  "answers": { "programId": "fair_fares", "applicantId": "1cc4394a-...", "eligibilityStatus": "potentially_eligible", "readyForPreview": true, "missingFields": [], "fields": { "...": "the exact payload from step 8" } },
  "created_at": "2026-09-04T12:58:58.813927+00:00", "updated_at": "2026-09-04T12:58:58.813927+00:00", "submitted_at": null
}] }
```

Direct query confirmed the row exists and `answers` matches the real payload from step 8
byte-for-byte (full JSON in the raw transcript).

## Step 10 — `deleteMyData()`, verified for real

```json
{ "httpStatus": 204 }
```

Direct queries immediately after, scoped to the same applicant/user ids used throughout this run:

```json
{ "users": [], "applicant_profiles": [], "ocr_extractions": [], "field_provenance": [], "applications": [] }
```

Every row created in steps 3–9 is genuinely gone — confirms both that `deleteMyData()`'s single
`DELETE FROM users WHERE auth_user_id = ...` actually works under the live RLS policy
(`users_delete ON users FOR DELETE USING (auth_user_id = auth.uid())` — present and correct, not a
gap) and that the cascade (`users` → `applicant_profiles` → `ocr_extractions`/`field_provenance`/
`applications`, all `ON DELETE CASCADE`) is real, not theoretical.

The one row `deleteMyData()` was never going to touch — the manually-created `form_versions` row,
since it isn't applicant-owned data and doesn't hang off the cascade — was cleaned up separately by
hand (service-role `DELETE`) so this demonstration didn't leave debris in a shared, public table.

## Summary of what this run surfaced, beyond a successful walkthrough

1. **New finding**: a third `programId` casing mismatch — `benefit_programs.code` (seeded
   mixed-case from the static catalogue) vs. the live discovery layer's lowercased id — breaks a
   direct lookup even after the previous session's resolver fix, because that fix targets a
   different boundary (discovery id → the `fair_fares`/`idnyc`/`nyc_care` literal scheme, not → the
   database's `benefit_programs.code`). Not fixed here — this command was discovery/demonstration,
   not a fix task.
2. **New finding**: `form_versions` has zero rows and no client-writable path anywhere in the
   repo, blocking any real `applications` insert (manual or otherwise) until one exists.
3. **Confirmed working**: `saveDocument()`'s insert-never-upsert design, `deleteMyData()`'s
   cascade and its RLS policy, and the reconciliation engine's precedence rule (rule 1) — tested
   against a real, unequal-authority disagreement, which is what this exact document combination
   produces (not the equal-authority, user-escalated case, which a different combination would).
4. **Confirmed disconnect, not a bug**: `loadProfile()`'s `PersistedProfile` and backend's
   `MockUserProfile` are genuinely different shapes with no adapter between them anywhere in the
   codebase — every field this journey moved across that boundary required a manual, hand-written
   conversion (date format, address structure, income period, household size).
