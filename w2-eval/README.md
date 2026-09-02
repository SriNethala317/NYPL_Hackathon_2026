# w2-eval

A bake-off between two ways of reading a W-2, scored against one contract.

- **Track A** — OCR → deterministic anchor parser → LLM only on low confidence
- **Track B** — a vision model reads the image directly

The deliverable is `results/report.md`, not a feature. This directory is standalone: it has its own
`package.json` and is not part of the Expo app's build, tsconfig, or jest run.

## Running it

```bash
npm install
node make-fixtures.mjs                       # render the corpus (needs google-chrome)

npx tsx harness/run.ts --engines stub-null   # the gate: must score clearly negative
npx tsx harness/run.ts --track b --vlm gemini --input fixtures/ --out results/
npx tsx harness/run.ts --track a --ocr paddle --input fixtures/ --out results/
npx tsx harness/run.ts --tracks a,b --out results/report.md   # both, once merged

npm test          # 40 unit tests
npm run typecheck
```

`--replay` scores from `results/raw/` without calling any API — use it while iterating on the
scorer. `--no-cache` forces fresh calls.

## Where the code lives

| Path | Runs on | Notes |
|---|---|---|
| `core/` | Node **and** React Native | Plain TS, no `node:` imports. Lifts into the app unchanged. |
| `harness/` | Node only | Walks a corpus, writes a report. Neither exists on a phone. |
| `tracks/` | Node now, RN later | One directory per track, each on its own branch. |

## Branches

Shared code lands on `front-end`; each track develops in isolation.

```
front-end ──┬── core/, harness/, fixtures     ← shared
            ├── track-a-ocr-llm               ← tracks/a-ocr-llm/ only
            └── track-b-vlm                   ← tracks/b-vlm/ only
```

A bug in `core/` or `harness/` is fixed on `front-end` and merged into both. Never on a track
branch: two tracks scored by different scorers are not comparable, which is the one thing this
project exists to avoid. Both branches merge back before the head-to-head report is generated.

`harness/run.ts` imports tracks dynamically, so a branch containing only one of them still runs and
reports the other as absent rather than failing to resolve.

## Expo Go is a hard constraint

Every engine must be reachable from Expo Go, which means every engine is a `fetch` call. No
on-device OCR: iOS Vision and Android ML Kit need native modules, and `tesseract.js` cannot run on
Hermes at all. An engine that scores well but cannot be called from the app is worth nothing, so
it is disqualified rather than reported.

That leaves two engines where the document reaches no third party — the self-hosted PaddleOCR
sidecar (Track A) and local Ollama (Track B) — and three where it does: OCR.space, Gemini, Groq.

## Two departures from the eval spec

Both are deliberate and both are argued at the point they occur in the code.

1. **Correct abstention scores 0, not +1** (`harness/score.ts`). On a sparse form, +1 per
   abstention lets an engine that reads nothing score positive, and it inflates every engine's
   score in proportion to how much it left blank — which distorts the ranking even when no score
   goes positive. Abstentions are still counted and reported.
2. **Hallucination is found by walking what the engine emitted**, not the truth's keys. A truth-key
   loop is structurally blind to invented fields. The app already shipped that bug: a test at
   `src/features/extraction/ocr-accuracy.test.ts:136-143` named "never invents a value it could not
   read" asserts `/got nothing|got /` against strings that always contain `got `, so it cannot fail.

## Fixtures are rendered, not photographed

Ground truth is authored first and the image rendered from it, so the truth never passes through an
extractor or a human transcriber. But a synthetic image that was never printed lacks real capture
artefacts, so both tracks score higher here than they would on a photograph of a real form. Treat
the numbers as an upper bound.

To add photographed fixtures later, drop a `.jpg` beside a matching `.truth.json` — the runner
picks it up with no code change.

13 fixtures across 4 layouts (IRS red-ink, plain laser 4-up, ADP-style, Gusto-style) and 5 capture
variants, covering single-state, multi-state, several box-12 codes, a populated box 14, an empty
box 12, and one crop that cuts off boxes 15-20 so abstention is scored too.

All data is fabricated. SSNs use the 900-99 range, which has never been issued.
