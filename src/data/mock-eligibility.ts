import { programById, programs, type ProgramId } from './programs';
import type { ProfileFieldKey } from './profile-fields';

import type { DocumentKind, EligibilityStatus as VisualStatus } from '@/theme';

/**
 * A stand-in for `checkEligibility()` from `src/features/eligibility` on the validation-system
 * branch, which is the real engine.
 *
 * The types below mirror that engine's contract exactly, so replacing this file is a single
 * import change rather than a refactor of every screen. Do not "simplify" the shape — the
 * duplication is deliberate, because this branch cannot import from that one yet.
 *
 * Note the vocabulary: the worst outcome is `likely_not_eligible`, never `not_eligible`. The app
 * screens; only the agency decides. The UI must never present this as a determination.
 */

export type EngineStatus =
  | 'potentially_eligible'
  | 'needs_more_information'
  | 'likely_not_eligible';

export type ProgramSource = { name: string; url: string; lastVerified: string };

export type EligibilityResult = {
  programId: string;
  programName: string;
  status: EngineStatus;
  /** Why the applicant may not qualify. Rendered on the detail screen. */
  reasons: string[];
  /** Field keys still needed. Drives "Add: Proof of address". */
  missingFields: string[];
  source: ProgramSource;
};

export type EligibilityInput = {
  householdSize?: number;
  /** Annual, matching the engine. The form captures monthly and converts at this boundary. */
  annualIncome?: number;
  documentsOnFile: readonly DocumentKind[];
};

/** Engine vocabulary → the theme's visual token keys, so styling never learns engine terms. */
export function toVisualStatus(status: EngineStatus): VisualStatus {
  switch (status) {
    case 'potentially_eligible':
      return 'yes';
    case 'needs_more_information':
      return 'more';
    case 'likely_not_eligible':
      return 'no';
  }
}

/** The form asks for monthly income because the design does; the engine wants annual. */
export function monthlyToAnnual(monthly: string | number): number | undefined {
  const n = typeof monthly === 'number' ? monthly : Number(String(monthly).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 12) : undefined;
}

export function evaluate(programId: ProgramId, input: EligibilityInput): EligibilityResult {
  const program = programById(programId);
  const reasons: string[] = [];
  const missingFields: string[] = [];

  const missingDocs = program.requires.filter((d) => !input.documentsOnFile.includes(d));
  missingFields.push(...missingDocs);

  // Only judge income once the household size it depends on is actually known — a limit read
  // against the wrong household size is worse than no answer.
  if (input.annualIncome !== undefined && input.householdSize !== undefined) {
    const limit = program.annualIncomeLimit(input.householdSize);
    if (input.annualIncome > limit) {
      reasons.push(`income-over-limit:${limit}`);
    }
  } else if (missingDocs.length === 0) {
    if (input.annualIncome === undefined) missingFields.push('income');
    if (input.householdSize === undefined) missingFields.push('household');
  }

  const status: EngineStatus =
    reasons.length > 0
      ? 'likely_not_eligible'
      : missingFields.length > 0
        ? 'needs_more_information'
        : 'potentially_eligible';

  return {
    programId: program.id,
    programName: program.source.name,
    status,
    reasons,
    missingFields,
    source: program.source,
  };
}

export function evaluateAll(input: EligibilityInput): EligibilityResult[] {
  return programs.map((p) => evaluate(p.id, input));
}

/** `missingFields` mixes document kinds and profile fields; the UI renders them differently. */
export function isDocumentKind(field: string): field is DocumentKind {
  return ['id', 'address', 'income', 'lease', 'utility'].includes(field);
}

export function isProfileFieldKey(field: string): field is ProfileFieldKey {
  return ['fullName', 'dob', 'address', 'household', 'income'].includes(field);
}

/** Pulls the limit back out of a `income-over-limit:<n>` reason code. */
export function limitFromReason(reason: string): number | null {
  const match = /^income-over-limit:(\d+)$/.exec(reason);
  return match ? Number(match[1]) : null;
}
