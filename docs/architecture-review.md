# Architecture review — Enroll NYC

A review of the assumptions in `docs/design/README.md` against the actual pipeline
(upload → cloud storage → OCR → LLM → database → NYC APIs, on Supabase), and against the
eligibility engine already written on the `validation-system` branch.

Written 2026-08-16, alongside the front-end screen build.

---

## 1. The privacy note is false as written

The design puts this under the document lists on three screens:

> Documents stay encrypted on your device and are shared only with the agency you apply to.

Neither clause survives the architecture. Documents go to Supabase, and their contents pass
through a third-party LLM. The design doc contradicts itself on the same point — it separately
notes that upload "is an API call in production."

This is not a wording nitpick. It is a privacy representation made to people handing over
government identity documents, and under the **NY SHIELD Act** anyone holding New York residents'
private information owes reasonable administrative, technical and physical safeguards. As of March
2025 that definition explicitly covers medical history, diagnoses and health-insurance data —
which NYC Care and Medicaid screening pull straight in.

**Done:** replaced with copy that describes what actually happens.

> Your documents are encrypted in transit and at rest, used only to fill your applications, and
> deleted once we have read them.

That sentence is only true if the deletion actually happens — see §2.

## 2. Retention: follow IDNYC

**IDNYC retains no identity or residency documents at all.** The original Local Law 35 bill said
the city "shall not retain originals or copies"; retention was added during negotiation, and after
sustained pressure the City reversed course entirely — since 7 December 2016 it holds no
underlying documents. The NYCLU and Families for Freedom had withdrawn support from the program
over precisely this, fearing the records would be used by federal immigration authorities.

Our users are international students with I-20s, SEVIS IDs and visa status. That is the same risk
population, and a retained document store is the same liability.

**Recommendation, adopted:** extract then discard. Read the document, persist the derived fields,
delete the original. A breach then exposes a name and an income band rather than a passport and a
visa. The Profile screen now reflects this — rows read *"Read Aug 16 · original deleted"* rather
than showing a stored filename forever.

## 3. The design doc disagrees with our own eligibility engine

`src/features/eligibility` on `validation-system` is more careful than the design. Where they
conflict, the engine is right.

| | `docs/design/README.md` | `src/features/eligibility` |
|---|---|---|
| Income unit | monthly, one flat cap per program | **annual**, varies by household size |
| Fair Fares cap | `$2,650/mo` → $31,800/yr, matching no real bracket | `$23,940` (1 person) … `$40,980` (3), +`$8,520`/person past 8 |
| Worst status | `NOT ELIGIBLE` | `likely_not_eligible` |
| Programs | Fair Fares, SNAP, Medicaid | Fair Fares, IDNYC, NYC Care |
| Rule provenance | none | `ProgramSource { url, lastVerified }` |
| User confirmation | "never surfaced field-by-field" | `confirmedFields[]` |

Two consequences worth stating plainly:

- **The design's headline demo is wrong.** It puts Medicaid in "Not eligible" because Maria's
  $2,310/mo exceeds a hardcoded $1,800/mo. Run the real numbers — household of 3, $27,720/yr — and
  she comfortably qualifies for all three programs. The third group only exists because the cap
  was wrong. `nyc-care.ts` refuses this class of inference outright, and says so in a comment:
  *"This engine never infers it from income."*
- **`reasons[]` and `missingFields[]` already map onto the UI** the design drew — the meta line
  ("Add: Proof of address") and the "Before you can apply" card. No new UI is needed to accept
  real engine output.

The front end now speaks the engine's vocabulary: `src/data/mock-eligibility.ts` returns the
engine's `EligibilityResult` shape verbatim, so swapping the stand-in for `checkEligibility()` is
one import change.

## 4. Other findings

**No error state exists anywhere in the design.** The 1700ms scan always succeeds. Real OCR + LLM
is slower and fails routinely — blurry photos, unsupported formats, timeouts. There is no
"couldn't read that", no low-confidence flag, no re-upload path. The state model now carries a
`failed` document status so the gap is visible in the type rather than silently impossible, but
**the screen for it still needs designing.**

**Silent extraction plus a certification checkbox is a liability trap.** The design specifies that
extraction is "never surfaced field-by-field", then asks the user to tick *"I certify the
information above is true."* If the LLM hallucinates an income figure, the applicant has just
certified a false statement on a government benefits application — and the legal exposure is
theirs, not ours. Partially addressed: every field on the form now shows its provenance ("From
your Pay stubs" / "Enter this yourself"). The stronger fix is Barshat's `confirmedFields[]` —
require explicit confirmation of extracted values, especially income.

**Reference numbers must be server-issued.** The design specifies a client-side incrementing
counter (`NYC-2026-4181`). Sequential identifiers are enumerable and leak application volume. The
mock keeps the format but randomises; production must issue them server-side.

**Immigration data is the single most dangerous field in the system.** NYC's Identifying
Information Law (LL 245/2017) restricts how identifying information is collected, retained and
disclosed, and requires agencies to report on it. Don't store visa status or SEVIS ID unless a
specific program demands it, and never store a raw SEVIS ID.

**Language coverage is short.** NYC Local Law 30 sets language access at the top ten citywide
languages. EN/ES is a reasonable hackathon scope — adding a language is now just another key in
`src/i18n/strings.ts` — but it is a launch blocker, and the design already concedes that long
program descriptions stay English.

**Two items kept by explicit decision**, noted here so they aren't forgotten:

- **"Verified"** claims an official validation that never happened; the app OCR'd a file.
- **"OFFICIAL CITY OF NEW YORK APP"** asserts a government affiliation this project does not have.
  This must not survive a public demo.

## 5. Recommendations for the Supabase build

In rough order of leverage:

1. **Run OCR/LLM in Edge Functions, never the client.** The service-role key must never reach the
   app bundle.
2. **Default-deny RLS on every table**, opened by explicit policies keyed to `auth.uid()`.
3. **Column-level encryption (Supabase Vault / pgsodium)** for DOB, address, income and any ID
   numbers. Supabase's at-rest AES-256 protects the disk, not a leaked service key.
4. **Get a zero-retention agreement with the LLM provider.** Sending a raw identity document to a
   third-party model without a DPA is itself a disclosure. Redact before sending where possible.
5. **Move eligibility rules server-side, with effective dates.** `ProgramSource.lastVerified`
   already models this; rules should update without an app release, and a determination should be
   reproducible after the fact.
6. **Audit-log every read and disclosure of profile data**, adapting LL 245's disclosure-reporting
   duty. It is also what makes a breach investigation tractable.
7. **Ship user-initiated deletion that genuinely purges**, and write the SHIELD breach-notification
   runbook before you need it.
8. **Never log PII** to analytics or crash reporting.

Note that Supabase's HIPAA posture requires a signed BAA and their paid add-on. If health data
enters scope — and NYC Care and Medicaid screening bring it close — that is a prerequisite, not a
nice-to-have.

## 6. Pre-launch checklist

- [ ] Privacy copy re-reviewed against whatever the architecture actually does at that point
- [ ] Document deletion verified end-to-end, not just intended
- [ ] "Verified" wording reconsidered
- [ ] "OFFICIAL CITY OF NEW YORK APP" removed
- [ ] Extraction failure and low-confidence states designed and built
- [ ] Reference numbers issued server-side
- [ ] Language coverage expanded toward Local Law 30
- [ ] RLS policies reviewed by someone other than their author
- [ ] BAA signed if health data is in scope

## Sources

- [NY SHIELD Act — reasonable safeguards](https://iapp.org/news/a/new-yorks-shield-act-has-taken-effect-what-does-this-mean-for-your-business)
- [IDNYC privacy and confidentiality](https://www.nyc.gov/site/idnyc/about/privacy-and-confidentiality.page)
- [IDNYC document retention reversal](https://fortunesociety.org/media_center/some-question-citys-decision-to-keep-idnyc-documents/)
- [NYC Identifying Information Law, LL 245/2017](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-129569)
- [Citywide Privacy Protection Policies and Protocols (2025)](https://www.nyc.gov/assets/oti/downloads/pdf/reports/cpo/2025%20Citywide%20Privacy%20Protection%20Policies%20and%20Protocols_web.pdf)
- [Security at Supabase](https://supabase.com/security)
- [Supabase HIPAA / BAA requirements](https://www.accountablehq.com/post/is-supabase-hipaa-compliant-in-2026-baa-phi-and-security-explained)
