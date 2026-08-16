# Handoff: Enroll NYC — mobile benefits enrollment (React Native)

## Overview
Enroll NYC is an iOS-first mobile app that makes enrolling in New York City benefit
programs fast: the user uploads identity and income documents once in **Profile**, the app
silently extracts the data, and **Enrollment** then lists every program they can apply to
with the application already prefilled. Three tabs: Home (application status), Enrollment
(matched programs), Profile (documents).

## About the Design Files
The files in this bundle are **design references authored in HTML** — streaming prototypes
that show intended look and behavior. They are **not** production code to port line by line.
The task is to **recreate these designs in React Native** using the target app's existing
navigation, component library, and theming conventions. If the RN project does not exist
yet, scaffold it (Expo + React Navigation is a reasonable default) and implement the designs
there. `ios-frame.jsx` is only a device bezel used for presentation in the browser — it has
no production equivalent; on device, the real status bar and home indicator replace it.

## Fidelity
**High fidelity.** Colors, type sizes, radii, spacing, copy, and interaction states are all
final. Recreate the UI faithfully, substituting RN primitives (`View`, `Text`, `Pressable`,
`ScrollView`, `TextInput`, `Modal`) for the HTML elements and RN styles for the inline CSS.

## Screens / Views

### 1. Splash
- **Purpose**: brand moment + establishes the app is official. Auto-dismisses after 2000ms;
  tapping anywhere dismisses immediately.
- **Layout**: full-bleed navy `#1B2E7F`. Lockup centered vertically and horizontally, badge
  pinned 54px from the bottom, 36px horizontal padding.
- **Lockup**: row, `alignItems: center`, gap 20.
  - "NYC" — Archivo Black 76px, letterSpacing −3.5, lineHeight 0.9 × size; N `#FFFFFF`,
    Y `#1E9BE0`, C `#00A550`.
  - Vertical rule: 1px wide, stretches to lockup height, `rgba(255,255,255,0.32)`.
  - Right block: "Enroll" 24px/26px weight 700 letterSpacing −0.4 `#FFFFFF`; below it
    "Human Resources / Administration" 13px/16px weight 400 `rgba(255,255,255,0.7)` on two lines.
- **Badge**: pill, background `rgba(255,255,255,0.12)`, padding 7×14, radius 999; 8px green
  `#00A550` dot + text "OFFICIAL CITY OF NEW YORK APP" 12px weight 600 letterSpacing 0.3
  `rgba(255,255,255,0.9)`.
- **Animation**: 0.4s fade in.

### 2. App chrome (all three tabs)
- **Header**: white, borderBottom 1px `#D6D8DE`, padding 60/20/12 (the 60 is status-bar inset —
  in RN use `SafeAreaView` instead).
  - Left: same NYC lockup at 25px (navy N `#1B2E7F`, cyan Y, green C), 1px × 22px `#D6D8DE`
    divider, "Enroll" 15px/18px weight 700.
  - Right: language pill — height 34, radius 999, background `#F4F5F7`, border 1px `#D6D8DE`,
    14px circle outline (1.5px navy) + label "EN"/"ES" 13px weight 700 navy. Tapping toggles
    the whole app between English and Spanish.
  - Below: screen title 28px weight 700 letterSpacing −0.6 (`Your applications` /
    `Programs for you` / `Profile`).
- **Scroll region**: background `#F4F5F7`, content padding 18/20/40, `paddingBottom: 104` so
  content clears the floating tab bar.
- **Tab bar — liquid glass**, absolutely positioned: left/right 16, bottom 26, height 70,
  radius 999.
  - Blur layer: `backdropFilter: blur(22px) saturate(180%)`, background
    `rgba(255,255,255,0.62)`. In RN use `expo-blur` `<BlurView intensity={~60} tint="light">`.
  - Shine layer: border 0.5px `rgba(255,255,255,0.7)`, inset highlights (approximate in RN
    with a hairline border + a soft top highlight).
  - Outer shadow: `0 2px 10px rgba(13,13,13,0.10), 0 12px 30px rgba(13,13,13,0.12)`.
  - Three items, each flex 1, height 58, radius 999, glyph + 11px weight 600 label, gap 5.
    Active: background `rgba(255,255,255,0.78)`, subtle shadow, color `#1B2E7F`.
    Inactive: transparent, color `#5A5F6B`. 0.2s background transition.
  - Glyphs are built from plain views (house outline, 3-bar list, person). Replace with the
    project's icon set (SF Symbols: `house`, `list.bullet`, `person`) at ~22px.

### 3. Home — Your applications
- **Empty state** card: white, border 1px `#D6D8DE`, radius 18, padding 26/22, gap 10.
  44px `#F4F5F7` rounded-12 tile with a document glyph; title "No applications yet" 19px
  weight 700; body 15px/21px `#5A5F6B`; primary button "Add documents" (height 48, radius 14,
  navy, white 16px weight 600) → Profile tab.
  Below the card: lock glyph (green) + privacy note 13px/19px `#5A5F6B`:
  "Documents stay encrypted on your device and are shared only with the agency you apply to."
- **Application card** (one per application): white, radius 18, padding 18, gap 14.
  - Row: program name 17px weight 700; ref + date 13px `#5A5F6B` tabular-nums; right badge
    with current stage — background `#E8F4FB`, text navy 12px weight 700, radius 8.
  - Stage tracker: three equal columns `Submitted → In review → Decision`. Each column has a
    14px dot and a 2px connector bar; reached stages navy `#1B2E7F`, upcoming `#D6D8DE`;
    labels 11px weight 600 (navy when reached, `#9AA0AC` otherwise).
  - Footer note 13px/19px `#5A5F6B` above a 1px `#E9EAEE` divider.
- Secondary button "See other programs" when at least one application exists.

### 4. Enrollment — Programs for you
- **Empty state** card (kept for demo purposes): title "Nothing to show yet", body
  "Once your ID and income documents are on file, eligible programs appear here
  automatically.", primary "Add documents", secondary "Preview with sample documents"
  (loads four verified documents — demo affordance, drop it in production).
- **Groups**, in order, only rendered when non-empty:
  1. `YOU MAY QUALIFY` — dot `#00A550`
  2. `NEEDS MORE INFO` — dot `#F2B21B`
  3. `NOT ELIGIBLE` — dot `#5A5F6B`
  Group label: 13px weight 700, uppercase, letterSpacing 0.6, `#5A5F6B`.
- **Program row**: white card, radius 16, border 1px `#D6D8DE`, **borderLeft 4px in the group
  color**, padding 16/16/16/15, gap 8. Name 17px weight 700 + `›` chevron `#D6D8DE`;
  blurb 14px/20px `#5A5F6B`; meta line 13px weight 600 —
  eligible: "Benefit: 50% off subway & bus" style fact; needs-info: "Add: Proof of address";
  not eligible: "Income above the … limit ($1,800/mo)". Meta colors `#00A550` / `#8a6410` /
  `#5A5F6B`. Tap → program detail.

### 5. Program detail (pushed screen)
- Header: white, 58/20/14, back control "‹ Back" navy 16px weight 600, min 44×44 hit area.
- Body: status badge (same three color pairs as the groups), program name 28px weight 700
  letterSpacing −0.7 lineHeight 33, description 16px/23px `#5A5F6B`.
- Facts card: white radius 16, rows padding 14/16 divided by 1px `#E9EAEE`; label 14px
  `#5A5F6B` left, value 14px weight 600 right.
- If not directly eligible, an explanation card: "Before you can apply" (which documents to
  add) or "Why you are not eligible" (income vs. limit).
- Sticky footer button, height 52 radius 16: eligible → "Start application" (navy);
  needs info → "Add documents" (cyan `#1E9BE0`) → Profile; not eligible → "See other
  programs" (`#F4F5F7`, navy text) → Enrollment.
- Transition: 0.24s ease-out push (translateX 24 → 0, opacity 0.4 → 1). In RN this is the
  default stack push.

### 6. Application form (single long form)
- Header: back "‹ Back" + program name 15px weight 600.
- Info banner: `#E8F4FB` radius 14, padding 14/16, navy 14px/20px: "Prefilled from your
  uploaded documents. Check each field before you continue."
- Five fields, gap 18, each: label 14px weight 600; input height 50, radius 14, border 1px
  `#D6D8DE` (`#C0392B` when required-and-touched), white, 16px text, padding 14; hint 12px
  (`#5A5F6B`, or `#C0392B` "Required").
  Fields and their document source: Full name (Photo ID), Date of birth (Photo ID),
  Home address (proof of address), People in household (lease), Monthly income (pay stubs).
- Consent row: white card radius 16, 24px checkbox (radius 7, navy fill + white ✓ when on),
  text 14px/20px `#5A5F6B`: "I certify the information above is true and authorize the City
  to verify it with the documents on file."
- Footer: "Review application" button — navy when complete, `#8F97C4` when not; below it a
  hint line 12px centered ("Complete every field and certify to continue" / green "All
  required fields complete"). Tapping while incomplete marks fields touched and shows errors.

### 7. Review
- Header: "‹ Edit" back, title "Review".
- Heading "Check your answers before submitting" 22px/28px weight 700.
- Summary card: one row per field plus a "Program" row (same row style as the facts card).
- Attached-documents card: label + one row per verified document with a 34×26 striped
  thumbnail and "Photo ID / IDNYC · idnyc_front.jpg" 14px.
- Footer: "Submit application" (navy, height 52, radius 16).

### 8. Confirmation
- Full white screen, 0.3s fade in, centered: 72px green `#00A550` circle with white ✓ 34px;
  title "Application submitted" 26px weight 700; body 16px/23px `#5A5F6B`; reference number
  in a `#F4F5F7` pill, monospace 15px navy (`NYC-2026-4181`, incrementing);
  "View status" button (navy, full width) → Home.

### 9. Profile
- Identity card: 52px navy circle with white initials 19px weight 700, name 17px weight 700,
  "3 of 5 documents verified" / "No documents on file yet" 14px `#5A5F6B`, and a right-aligned
  "Load sample" / "Reset demo" text button (demo-only).
- "YOUR DOCUMENTS" section, five rows (Photo ID / IDNYC, Proof of address, Pay stubs, Lease,
  Utility bill). Row: white radius 16, padding 14, min height 44; 54×40 thumbnail (radius 8,
  border 1px `#D6D8DE`; when verified a 135° two-tone stripe tinted per document type, else
  `#F4F5F7`); label 16px weight 600; sub line monospace 13px (filename, or "Not added"
  `#9AA0AC`); badge "Verified" (`#E4F6EC` / `#00733A`) or "Add" (`#F4F5F7` / navy).
  Tapping an unadded row opens the upload sheet targeted at that document type.
- Primary "Add a document" button (navy, height 52, radius 16, with a `+`).
- Lock glyph + privacy note.

### 10. Upload sheet (modal)
- Scrim `rgba(13,13,13,0.45)` (0.2s fade), sheet slides up 0.28s
  `cubic-bezier(0.2,0.9,0.3,1)`; white, radius 24 top corners, padding 12/20/34, 40×5 grabber.
- **Choose state**: title ("Add a document" or "Add Pay stubs"), then two equal-weight option
  cards side by side, gap 12, border 1px `#D6D8DE` radius 16 padding 18/14:
  "Scan with camera / Photograph the document" (navy camera glyph) and
  "Choose a file / PDF or image from Files" (cyan document glyph). Privacy note, then
  "Cancel" (`#F4F5F7`, navy).
- **Scanning state** (both options lead here): 92×68 striped document placeholder with a
  cyan gradient bar sweeping top→bottom on a 1s linear loop; "Reading your document" 17px
  weight 700; target document name 14px `#5A5F6B`. After **1700ms** the document flips to
  Verified and the sheet closes. Extraction itself is never surfaced field-by-field — it only
  shows up as prefilled form values.

## Interactions & Behavior
- Splash → app after 2s or on tap.
- Tab switching resets any pushed route back to the tab root.
- Eligibility recomputes on every document change; programs move between groups live.
- Form prefill happens when "Start application" is pressed: any empty field whose source
  document is verified is filled from the extracted values.
- Validation: all five fields non-empty **and** consent checked → "Review application"
  enabled; otherwise pressing it reveals red borders and "Required" hints.
- Submit creates an application (`stage: 0` = Submitted), prepends it to the list, generates
  the reference number, clears consent, and routes to confirmation.
- Language toggle switches all chrome, labels, buttons, and program names/blurbs (en/es
  dictionaries in the logic class). Long program descriptions remain English in the prototype.

## State Management
```
locked            boolean   splash visible
tab               'home' | 'enroll' | 'profile'
route             'tabs' | 'detail' | 'form' | 'review' | 'confirm'
programId         string | null
lang              'en' | 'es'
docs              { id, address, income, lease, utility: boolean }   verified flags
sheetOpen         boolean
sheetFor          document key | null      null = generic add
scanning          boolean                  1700ms timer
form              { name, dob, address, household, income: string }
consent           boolean
touched           boolean                  validation revealed
applications      [{ programId, ref, date, stage }]
lastRef           string | null
```
Derived: `classify(program)` → `{group: 'yes'|'more'|'no', missing[]}` from the program's
required documents and its monthly-income limit; groups, docList, review rows, and all button
states come from that. In RN this maps cleanly to a context/reducer (or Zustand) plus a
React Navigation stack for detail/form/review/confirm and a tab navigator for the three tabs.
Real data: document upload + extraction is an API call in production (the 1700ms timer stands
in for it), and eligibility rules should come from the server, not the client.

### Program rules used in the prototype
| Program | Required documents | Monthly income limit |
|---|---|---|
| Fair Fares NYC | Photo ID, pay stubs | $2,650 |
| SNAP food benefits | Photo ID, pay stubs, proof of address | $3,200 |
| Medicaid | Photo ID, pay stubs | $1,800 |

Sample extracted values: Maria Reyes, 04/18/1991, 1240 Grand Concourse, Bronx, NY 10456,
household 3, $2,310/month (so Medicaid lands in Not eligible).

## Design Tokens
**Colors** — Navy `#1B2E7F` (primary), Ink `#0D0D0D`, White `#FFFFFF`, Off-white `#F4F5F7`,
App border `#D6D8DE`, Divider `#E9EAEE`, Muted text `#5A5F6B`, Disabled text `#9AA0AC`,
Cyan `#1E9BE0`, Green `#00A550`, Green text `#00733A`, Green tint `#E4F6EC`,
Amber `#F2B21B`, Amber text `#8a6410`, Amber tint `#FDF3DC`, Navy tint `#E8F4FB`,
Navy disabled `#8F97C4`, Error `#C0392B`.
Rules: max two accents per screen, navy carries the identity, text on navy is always white.

**Spacing** 4 / 6 / 8 / 10 / 12 / 14 / 18 / 20 / 22 / 26 / 40 (screen bottom) / 104 (tab clearance).

**Radii** 5 (small tints) · 8 (badges) · 12–14 (buttons, banners) · 16 (cards, sheets’ inner) ·
18 (large cards) · 24 (sheet top) · 999 (pills, tab bar).

**Type** — display: Archivo Black (wordmark only). UI: SF Pro / system (`-apple-system`),
Helvetica Neue for the lockup subtext. Sizes 11 / 12 / 13 / 14 / 15 / 16 / 17 / 19 / 22 / 26 /
28 / 52 / 76; weights 400 / 600 / 700; monospace (SF Mono / Menlo) for filenames and reference
numbers.

**Shadows** — card: none (1px border instead). Tab bar: `0 2px 10px rgba(13,13,13,0.10)` +
`0 12px 30px rgba(13,13,13,0.12)`. Active tab pill: `0 1px 3px rgba(13,13,13,0.10)`.

**Motion** — fade 0.2–0.4s ease-out; push 0.24s ease-out; sheet 0.28s
`cubic-bezier(0.2,0.9,0.3,1)`; scan sweep 1s linear infinite; scan duration 1700ms;
splash 2000ms.

## Assets
No bitmap assets. Document thumbnails are CSS stripe placeholders tinted per document type —
in production these become real page thumbnails from the uploaded file. All glyphs are drawn
from plain boxes; replace them with the project's icon library (SF Symbols recommended).
Archivo Black is loaded from Google Fonts; bundle it with `expo-font` (or drop it for the
official City wordmark asset, which should come from the agency's brand kit — do not
reconstruct the wordmark from type in production).

## Screenshots
`screenshots/` contains one PNG per screen, captured from the prototypes:

| File | Screen |
|---|---|
| 01-splash.png | Splash |
| 02-enrollment-groups.png | Enrollment, all three eligibility groups |
| 03-program-detail.png | Program detail (Fair Fares, eligible) |
| 04-application-form.png | Application form, prefilled + consent checked |
| 05-review.png | Review |
| 06-profile.png | Profile, 5 of 5 documents verified |
| 07-upload-sheet.png | Upload sheet, choose state |
| 08-scanning.png | Upload sheet, scanning state |
| 09-confirmation.png | Confirmation |
| 10-home-status.png | Home with the stage tracker |
| 11-home-empty.png | Home empty state |
| 12-enrollment-empty.png | Enrollment empty state |

## Files
- `Enroll NYC.dc.html` — main prototype, starts empty (no documents, no applications).
- `Enroll NYC - Demo -all documents verified-.dc.html` — same app seeded with five verified
  documents, opening on Enrollment with all three eligibility groups populated and one SNAP
  application in review. Use this one to see the fully-populated states.
- `ios-frame.jsx` — presentation-only device bezel; no production equivalent.
- `CLAUDE.md` — the project color guide these designs follow.
