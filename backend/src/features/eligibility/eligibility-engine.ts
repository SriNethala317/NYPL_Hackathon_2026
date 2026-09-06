import { normalizeProfileForEligibility } from './normalize-profile';
import { validateProfile } from './profile-validation';
import { resolveCanonicalProgramId } from './program-id-resolver';
import { PROGRAM_EXTENSIONS } from './extensions';
import { scorablePrograms, type DocumentCategory } from './generic-catalogue';
import { evaluate as genericEvaluate, type GenericEligibilityResult, type GenericEngineStatus } from './generic-evaluator';
import type { EligibilityInput, EligibilityResult, MockUserProfile } from './types';

/**
 * `MockUserProfile` has no document-upload model at all (nothing in its shape tracks what's on
 * file), so the generic criteria's `requiredCategories` check genuinely does not apply in this
 * context. Passing every category as "on file" — rather than none — is what makes that check a
 * no-op here instead of silently claiming every program's document requirement is unmet. Same
 * convention `src/data/eligibility.test.ts` already uses (`ALL_PROOF`) for exactly this reason.
 */
const ALL_DOCUMENT_CATEGORIES: readonly DocumentCategory[] = [
  'identity',
  'immigration',
  'income',
  'residence',
  'other',
];

/**
 * Layers a program-specific extension check on top of the generic result. Extension-hook reasons
 * are exact, hand-written program rules — not a partial parse of prose — so unlike the generic
 * criteria's own `partial` safety net, a failure here always produces a hard stop.
 */
function combineWithExtension(
  generic: GenericEligibilityResult,
  extension: { reasonDetails: { code: string; sourceText?: string }[]; missingFields: string[] },
): GenericEligibilityResult {
  if (extension.reasonDetails.length === 0 && extension.missingFields.length === 0) return generic;

  const reasonDetails = [...generic.reasonDetails, ...extension.reasonDetails];
  const missingFields = [...new Set([...generic.missingFields, ...extension.missingFields])];

  const status: GenericEngineStatus =
    extension.reasonDetails.length > 0
      ? 'likely_not_eligible'
      : missingFields.length > 0 && generic.status === 'potentially_eligible'
        ? 'needs_more_information'
        : generic.status;

  return { ...generic, status, reasonDetails, missingFields, reasons: reasonDetails.map((detail) => detail.code) };
}

/**
 * Validates the profile, then screens every scorable program in the real NYC catalogue — ~49 of
 * 97, not the 3 this engine used to hardcode (`PROGRAM_VALIDATORS` and `programs/*.ts` are
 * retired). Fair Fares and NYC Care each get a program-specific extension check the generic
 * criteria table can't express (see `extensions.ts`) layered on top of their generic result.
 *
 * IDNYC does not get one, despite the old hardcoded `idnycValidator` checking NYC residency:
 * `program-criteria.generated.json`'s real entry for IDNYC (`P032en`) is `{minAge: 10}` only — no
 * `nycResident`. Checked why: IDNYC's actual eligibility text reads "All New Yorkers ages 10 and
 * up qualify," and `derive-criteria.mjs`'s residency heuristic only recognizes "resident(s) of
 * NYC" / "live in NYC" phrasing, not "New Yorkers." This is a real, pre-existing gap in the
 * heuristic deriver — not something to route around by adding a residency check here that the
 * data doesn't support. Flagged as follow-up work for `derive-criteria.mjs`, not fixed by this
 * port.
 */
export function checkEligibility(profile: MockUserProfile): EligibilityResult[] {
  validateProfile(profile);
  const input = normalizeProfileForEligibility(profile);

  return scorablePrograms().map((program) => {
    const generic = genericEvaluate(program.id, {
      age: input.age,
      nycResident: input.nycResident,
      householdSize: input.householdSize,
      annualIncome: input.annualIncome,
      categoriesOnFile: ALL_DOCUMENT_CATEGORIES,
    });

    const canonicalId = resolveCanonicalProgramId(program.id);
    const extend = canonicalId ? PROGRAM_EXTENSIONS[canonicalId] : undefined;
    const result = extend ? combineWithExtension(generic, extend(input as EligibilityInput)) : generic;

    return {
      // The literal scheme ("fair_fares") for the 3 programs everything downstream (form-payload
      // mappings, the /validate and /payload route guards) still keys on; the catalogue's own
      // lowercased id — matching what NycBenefitsCatalogProvider's /discover already returns —
      // for every other program, which has no literal scheme at all.
      programId: canonicalId ?? program.id.toLowerCase(),
      programName: result.programName,
      // scorablePrograms() guarantees criteriaFor(program.id)?.scorable, so genericEvaluate()
      // never takes its `!record?.scorable` branch here and can never actually return
      // 'not_screened' — this narrows the wider generic status type back to EligibilityResult's.
      status: result.status as EligibilityResult['status'],
      partial: result.partial,
      unchecked: result.unchecked,
      reasons: result.reasons,
      missingFields: result.missingFields,
      source: result.source,
    };
  });
}
