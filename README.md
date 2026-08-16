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
| `npm test` | Jest — 170 tests |
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
(age bounds, NYC residency, household-size income tables). **46 of 97 are scorable this way.** The
other 51 are shown as browsable with their official text — never scored, because inventing a
rejection out of a parser's limits is worse than admitting we do not know.

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
cleans, where OCR plus regex cannot. That path is wired and waits on a key (see below). Without
one, extraction runs on Tesseract at the accuracy above, with low-confidence values flagged and
forced through user confirmation.

The corpus includes a document containing *"IGNORE ALL PREVIOUS INSTRUCTIONS"*. A test asserts the
real value survives — document text is data, never instructions.

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
- **The `/privacy` screen is generated from those registries**, so it cannot drift into being
  untrue. `privacy-facts.test.ts` fails the build if a sensitive field is added without being
  disclosed.

Full reasoning and the NY-specific precedents: `docs/architecture-review.md`.
Pipeline design: `docs/upload-pipeline.md`.

## Environment

Nothing is required to run the app. Each of these upgrades a path that already works:

```bash
EXPO_PUBLIC_GEMINI_API_KEY=   # free tier; enables vision extraction and programme explanations
EXPO_PUBLIC_SUPABASE_URL=     # persistence; until set, state is in-memory and lost on restart
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

Put them in `.env` — never in a commit, never pasted into a chat.

## Layout

```
src/
  app/            expo-router routes. NOTE: any file here becomes a route — tests must not live here
    (tabs)/       Home, Enrollment, Profile
    program/[id]  apply/[id]  review  confirmation  privacy
  components/ui/      primitives (Text, Button, Card, Sheet, Icon, …)
  components/enroll/  domain components (ProgramRow, StageTracker, TabScreen, DetailScreen, …)
  data/           catalogue, eligibility, document registry, reconciliation, privacy facts
  features/       extraction (OCR + field matchers)
  state/          one reducer, all app state
  i18n/           en/es dictionaries; every user-visible string lives here
  theme/          design tokens — one fixed light palette, no dark mode
```

## What works, and what does not

**Works:** all 97 programmes browsable and 46 screened against real criteria · document upload
with classification, extraction and reconciliation · conflict handling when two documents disagree
· renewal reminders quoting the agency's own deadline · the full apply → review → submit flow ·
EN/ES · device lock · privacy screen.

**Mocked:** `store.upload()` still returns fixture values rather than calling the extraction
chain — the chain itself is real and tested, but is not wired to the camera yet. There is no
persistence and no accounts; everything resets on restart.

**Known gaps:** programme names and descriptions are English-only at source, so they do not
translate. NYC Local Law 30 expects the top ten citywide languages — two is hackathon scope, not a
finished position. The `/privacy` screen's "delete everything" clears in-memory state only,
because there is nowhere else for it to live yet.
