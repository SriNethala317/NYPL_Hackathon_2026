# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this project is

**Enroll NYC** — an iOS-first Expo app for enrolling in NYC benefit programs. The user uploads
identity/income documents once in Profile, the app extracts the data, and Enrollment lists every
program they qualify for with the application prefilled. Three tabs: Home (application status),
Enrollment (matched programs), Profile (documents).

**Current state:** the presentational component library is built (`src/theme`, `src/components`).
Nothing mounts it yet — `src/app/index.tsx` is a placeholder and `_layout.tsx` is a bare `Stack`.
Still to come: the navigator, screens, and all functional behavior (eligibility rules, document
upload, form state, en/es localization).

## Commands

```bash
npm start            # expo start — dev server, then i/a/w to open a platform
npm run ios          # expo start --ios
npm run web          # expo start --web
npm run lint         # expo lint
npx tsc --noEmit     # typecheck (strict mode is on)
```

No test runner is configured; there is no test command to run.

Because no screen renders the library yet, the useful smoke test is a **web static export** —
`app.json` sets `web.output: "static"`, so `npx expo export --platform web` server-renders every
route and fails loudly if a component throws. This machine is Linux (no iOS simulator), so
`google-chrome --headless --screenshot` against `npm run web` is the way to actually look at
something.

## Design specs — read before any UI work

`docs/design/README.md` is the authoritative handoff: every screen, its exact colors, type sizes,
radii, spacing, copy, interaction states, state shape, and the eligibility rules. It is
high-fidelity — the design is final, so match it rather than reinterpreting it.

- `docs/design/README.md` — full screen-by-screen spec, tokens, state model, program rules
- `docs/design/CLAUDE.md` — condensed color guide (auto-loads when editing in that dir)
- `docs/design/*.dc.html` — browser prototypes; **reference only**. Recreate designs with RN
  primitives; never port the HTML/CSS.

**The screenshots are unreliable.** Only 5 of the 12 files are distinct: `02/06/07/08` are all the
same Profile image and `03/04/05/09/10` are all the same Home image. Trustworthy files are
`01-splash`, `06-profile`, `10-home-status`, `11-home-empty`, `12-enrollment-empty`. Program
detail, application form, review, upload sheet, scanning and confirmation have **no** visual
reference — build those from the prose, which specifies them to the pixel.

Where the prose and a screenshot disagree, the screenshot wins. (Known case: the spec says the
application card's footer note sits *above* its divider; the screenshot shows the divider first.)

## Architecture

**Expo SDK 54 / React Native 0.81.5 / React 19.1.** Consult
https://docs.expo.dev/versions/v54.0.0/ rather than relying on general Expo knowledge.

The SDK is pinned to 54 on purpose — see `AGENTS.md`. App Store Expo Go is stuck at client
54.0.2, so anything newer cannot be opened on a physical iPhone. This forced two substitutions
worth knowing about:

- **No `expo-glass-effect`** (it has no SDK 54 build). `GlassSurface` is `expo-blur` over a
  translucent fill. It is the single place to restore real liquid glass if the SDK ever moves.
- **`expo-symbols` is iOS-only here** — `name` takes one SF Symbol, no platform map. `Icon`
  therefore pairs every SF name with a Material equivalent rendered through the `fallback` prop
  via `@expo/vector-icons`.

**Routing** is expo-router file-based, rooted at `src/app/` (not `app/`), with `main` set to
`expo-router/entry`. `app.json` enables `typedRoutes` and `reactCompiler` — the latter means
manual `useMemo`/`useCallback` is noise, so don't add it.

### The design system

`src/theme/` is the single source of truth and has no dark mode — the design is one fixed light
palette where navy `#1B2E7F` carries the identity and a screen uses at most two accents.

- `tokens.ts` — `colors`, `radius`, `typography` (roles, not sizes), `shadow`, `motion`, `layout`
- `eligibility.ts` — the yes/more/no status → color map. **Use this rather than picking status
  colors by hand**; it drives the group dot, a program row's left border, the status badge, and
  the meta-line color across three screens.
- `documents.ts` — the five document kinds and their thumbnail tints

`src/components/ui/` holds primitives (`Text`, `Button`, `Card`, `Badge`, `TextField`, `Checkbox`,
`Sheet`, `RowGroup`/`DataRow`, `GlassSurface`, `Icon`, …); `src/components/enroll/` holds the
domain components (`ProgramRow`, `StageTracker`, `DocumentRow`, `TabBar`, `AppHeader`, …). Both
have barrel `index.ts` files — import from `@/components/ui` and `@/components/enroll`.

Everything is **presentational**: props in, JSX out, no state, no data access, no navigation
imports. Callbacks arrive as `onPress`-style props. Keep it that way — the functional layer wires
behavior in from outside.

All user-visible strings are props, never literals, because the app toggles en/es at runtime.

### Things that will bite you

- **Never nest the themed `Text` inside another `Text` for styling spans.** Each variant sets its
  own `fontSize`, which overrides the parent's. `NycLockup` uses plain RN `Text` for its colored
  letters for exactly this reason.
- `GlassSurface` is the only component that should touch `BlurView`. Everything else composes it.
- `Icon` maps each role to an SF Symbol *and* a Material name, so it works on all three
  platforms. Add new glyphs to the `glyphs` map rather than branching on `Platform.OS`.
- The tab bar floats over the scroll region — screens must pad content by `layout.tabBarClearance`
  or the last card slides under the glass.
- Archivo Black (the NYC wordmark) is loaded at runtime by `useFonts` in `src/app/_layout.tsx`,
  **not** by the `expo-font` config plugin alone — config plugins don't apply in Expo Go, which
  is how this project runs. The app.json plugin entry stays for future dev builds.
- `shadow` tokens are `boxShadow` strings, supported natively in RN 0.81, which is what keeps the
  tab bar's two-layer shadow intact.

**Path aliases**: `@/*` → `./src/*`, `@/assets/*` → `./assets/*`.
