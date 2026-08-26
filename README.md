# Enroll NYC

Upload your documents once. See every New York City benefit programme you may qualify for, with
the application already filled in.

Built for the NYPL Hackathon 2026. Screens follow `docs/design/README.md`; programme data is the
City's own, from NYC Open Data.

---

## Quick start

```bash
npm install
npm start          # then press i / a / w
```

**Expo Go on iPhone works.** The project is pinned to **Expo SDK 54** for exactly that reason —
the App Store build of Expo Go is version 54.0.2 and cannot open a newer SDK. See `AGENTS.md`
before upgrading; it is not a preference, it is the only way this runs on a physical phone.

If the QR code shows `127.0.0.1`, your phone cannot reach it — use `npm start -- --host lan`, or
`--tunnel` if the phone is on a different network.

## Commands

| Command | What it does |
|---|---|
| `npm start` | Expo dev server |
| `npm run ios` / `android` / `web` | Open a platform directly |
| `npm test` | Jest — 306 tests across 22 suites |
| `npm run lint` | ESLint via `expo lint` |
| `npx tsc --noEmit` | Typecheck (strict) |
| `npx expo export --platform web` | Static-renders every route; a render crash fails the build |

`npm test` includes the OCR accuracy suite, which shells out to Tesseract and takes about 12
seconds. Skip it with `npx jest --testPathIgnorePatterns=ocr-accuracy`.

## Data: where the programmes come from

97 real programmes, from the [NYC Benefits and Programs dataset](https://data.cityofnewyork.us/d/kvhd-5fmu).
No API key — Socrata allows anonymous reads.

```bash
node scripts/ingest-programs.mjs    # dataset  -> programs.runtime.json (+ full record)
node scripts/derive-criteria.mjs    # official prose -> program-criteria.generated.json
```

Both run at **build time**, so the app makes zero network calls to Socrata and works offline. The
trade is staleness — `fetchedAt` records when the copy was taken, and re-running the scripts is
the only thing that changes it.

`derive-criteria` turns the City's `plain_language_eligibility` prose into machine-checkable rules
(age bounds, NYC residency, household-size income tables). **49 of 97 are scorable this way.** The
rest are shown as browsable with their official text — never scored, because inventing a rejection
out of a parser's limits is worse than admitting we do not know.

**40 are additionally marked `partial`**, meaning our reading is a fragment of the real rule — the
programme offers alternative routes ("65 or older, *or* legally blind, *or* deaf"), or turns on
something we never ask about. For those the engine will say "you may qualify" or "we need more
information", but **never "you may not"**. A fragment cannot support a rejection.

Every derived rule keeps the City's own sentence in `sources`, so when the app says someone may
not qualify it can show the line that decided it.

## Document extraction

`src/features/extraction/` — OCR plus label-anchored field matching. Tesseract needs no key, so
accuracy is **measured, not assumed**:

| Variant | Field accuracy |
|---|---|
| clean | 100% |
| skew | 100% |
| lowlight | 100% |
| glare | 82% |
| **blur** | **36%** |

Run it: `npx jest ocr-accuracy`. The corpus (`docs/ocr-corpus/`, built by
`scripts/make-ocr-corpus.mjs`) is **synthetic** — committing a photo of a real ID would hand out
the exact data this app exists to protect.

Blur is the cliff, and it is the argument for a vision model: one call classifies, reads and
cleans, where OCR plus regex cannot. Gemini vision is wired and switches on the moment a key is
set (see below).

Which reader runs is decided by the platform rather than by preference — `ocr-provider.ts` takes
the first that can actually run:

| Platform | Reader | Does the image leave the device? |
|---|---|---|
| Web | tesseract.js, inside the browser | No |
| Phone, Gemini key set | Gemini vision | Yes — the privacy screen names Google |
| Phone, no key | none, and it says so | No |

The phone has no free option, because **tesseract.js cannot run in Expo Go** — both of its workers
need APIs Hermes does not provide. Without a key the upload flow admits it and falls through to
typing the details in, rather than appearing to read and returning nothing.

The corpus includes a document containing *"IGNORE ALL PREVIOUS INSTRUCTIONS"*. A test asserts the
real value survives — document text is data, never instructions.

## Filling the actual form

The point of everything upstream. `src/features/forms/` fetches the agency's own PDF, fills it
from the profile, and hands it over through the system share sheet.

```bash
node scripts/inspect-form.mjs <pdf-url>   # dump a form's real field names
```

Mappings in `templates.ts` are written against those names, never guessed — a wrong field name
produces a PDF that looks filled and silently is not. A test asserts every mapped field still
exists on the real PDF, so an agency reissuing a form fails the build instead of quietly
submitting half-empty applications. Three forms are mapped this way: **DRIE**, **SCRIE** and
**IDNYC**.

**What it will not do is submit for you.** There is no public API for filing a NYC benefits
application; ACCESS HRA is client-facing only. The only way to automate it would be to hold
someone's government portal password, which this app will not ask for. So it produces the
completed form and links to the exact submission destination.

Reality of the source data: of 97 programmes, **10 publish a PDF link**, several of those links
are already dead, and some serve flat scans with no form fields. `fetchTemplate` treats link rot
as an expected outcome and falls back to the programme's apply page.

Fields we refuse to hold — an SSN box is still an SSN — are deliberately left blank with an
on-screen explanation, so the applicant completes them before signing.

*Web caveat:* browsers block the cross-origin PDF fetch (CORS), so the form screen shows its
fallback on web. Native has no such restriction; the fetch-and-fill chain is verified end-to-end
against the live nyc.gov URL in tests.

## Keeping benefits, not just getting them

Most people who lose food or health coverage lose it at **renewal**, not at application — a
recertification packet lost in the mail, or a portal that fails mid-upload. The app already holds
the documents and knows which programmes you are on, so it warns before the deadline and says
whether your documents are still usable.

Cadences come from the City's own wording (`derive-criteria.mjs` finds them in 3 of 97 programmes,
including SNAP). Programmes that state no cadence get no reminder — a made-up deadline is worse
than none, because people act on it.

Renewals appear from **two months out**, because that is roughly when agencies post the packet.
Surfacing them only in the final month would reproduce the failure the feature exists to prevent.

## Privacy

Not decoration: research on NYC uptake found roughly 25,000 more eligible non-citizens left the
SNAP caseload between 2017 and 2019 than expected, attributed to public-charge fear. For this
audience the data story *is* the product.

- **Extract then discard.** The document is read, derived fields are kept, the original is
  deleted. This follows IDNYC, which has held no underlying identity documents since 2016.
- **Never stored at all**: SSN, SEVIS ID, visa status, alien number, bank account number —
  declared per document type in `src/data/document-types.ts`.
- **The `/privacy` screen is generated from those registries**, so the lists cannot drift into
  being untrue. `privacy-facts.test.ts` fails the build if a sensitive field is added without
  being disclosed.
- **The copy describes what the code does today, in the present tense** — and changes with the
  build. Configure Gemini and the screen stops saying the image never leaves your phone and starts
  naming Google, because `documentDestination()` reads the provider that will actually run.

Full reasoning and the NY-specific precedents: `docs/architecture-review.md`.
Pipeline design: `docs/upload-pipeline.md`.

## Environment

Nothing is required to run the app. Each of these upgrades a path that already works:

```bash
EXPO_PUBLIC_GEMINI_API_KEY=   # free tier; the only way a phone can read a document at all
EXPO_PUBLIC_SUPABASE_URL=     # persistence; until set, state is in-memory and lost on restart
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

Put them in `.env` — never in a commit, never pasted into a chat.

## Layout

```
src/
  app/            expo-router routes. NOTE: any file here becomes a route — tests must not live here
    (tabs)/       Home, Enrollment, Profile
    program/[id]  apply/[id]  review  confirmation  privacy  form/[id]
  components/ui/      primitives (Text, Button, Card, Sheet, Icon, …)
  components/enroll/  domain components (ProgramRow, StageTracker, TabScreen, DetailScreen, …)
  data/           catalogue, eligibility, document registry, reconciliation, privacy facts
  features/       extraction (OCR + field matchers), forms (PDF fill + delivery),
                  backend (Supabase auth, profile repository)
  state/          one reducer, all app state; persistence.ts syncs it
  i18n/           en/es dictionaries; every user-visible string lives here
  theme/          design tokens — one fixed light palette, no dark mode
```

## What works, and what does not

**Works:** filling the real DRIE, SCRIE and IDNYC government PDFs from your profile and sharing
them · all 97 programmes browsable and 49 screened against real criteria · document upload from
the camera or the photo library, classified, read and reconciled through the live extraction
chain · conflict handling when two documents disagree · renewal reminders quoting the agency's own
deadline · the full apply → review → submit flow · EN/ES · device lock · privacy screen.

**Depends on what you configure.** Both keys are optional and both change what the app honestly
is:

- `EXPO_PUBLIC_SUPABASE_*` — documents, extracted fields and applications are saved and pulled
  back on the next launch. Without it, state lives in memory for the session and is gone on
  restart. Saving is fire-and-forget by design: a failed write costs you the convenience next
  time, never the form you came to print.
- `EXPO_PUBLIC_GEMINI_API_KEY` — a phone can read a document. Without it only the web build can,
  and the phone asks you to type the details in instead.

**Simulated:** "Load sample" and the demo buttons fabricate an applicant so the failure states can
be shown without a camera. Those documents are namespaced `sample-` and the first real upload
clears them, so an invented passport cannot outrank a real driver's licence.

**Known gaps:**

- **The privacy screen has not caught up with persistence, and it is the gap that matters.**
  Adding Supabase gave the app somewhere to keep data and the `/privacy` screen was never told.
  Two consequences, both of which make a stated promise untrue when a project is configured:
  "Delete everything" runs `purgeGeneratedForms()` and `store.reset()` — disk and memory — while
  `eraseEverything()`, which deletes the rows *and* signs out of the Keychain session so a
  reinstall is not handed back the same account, sits written and uncalled in
  `src/state/persistence.ts`; and "Where it goes" still reads "held only while the app is open and
  gone when you close it", because that copy branches on `documentDestination()` and never asks
  `persistenceAvailable()`. Fix both together, or the screen keeps disclosing the wrong app.
- Three of 97 programmes have a mapped fillable form. The dataset publishes a PDF link for 10
  (several already dead, some flat scans); every other programme links out to the agency's own
  apply page.
- Programme names and descriptions are English-only at source, so they do not translate. NYC Local
  Law 30 expects the top ten citywide languages — two is hackathon scope, not a finished position.
