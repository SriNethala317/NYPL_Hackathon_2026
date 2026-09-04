import { ensureApplicant } from './applicant-bootstrap';
import { supabase } from './supabase';
import type { RepoOutcome } from './profile-repository';

/**
 * Turning a validated form payload into a real `applications` row.
 *
 * Everything up through `POST /forms/:programId/payload` (see `backend/`) already produces a
 * complete, validated payload; nothing before this file ever persisted it. Follows the same
 * posture as `profile-repository.ts`: no throws, every failure returned through `RepoOutcome`,
 * degrades to a no-op when Supabase is not configured.
 */

/**
 * Shaped after `backend/src/features/form-payload/types.ts`'s `FormFillPayload`, not copied
 * verbatim: this app's own in-app apply flow (`src/state/app-store.tsx`'s `submit()`) has never
 * called `backend/`'s HTTP API and has its own local, 97-program eligibility engine
 * (`src/data/eligibility.ts`) with its own status vocabulary (`'yes'|'more'|'no'|'not_screened'`,
 * not backend's 3-program `'potentially_eligible'|...`). Forcing one caller's enum onto the other
 * would misrepresent what actually produced the value, so `eligibilityStatus` is a plain string
 * here — whichever engine called this stores its own real status, unstranslated. `applicantId` is
 * optional for the same reason: the UI caller does not know its own applicant id (only
 * `ensureApplicant()`, called below, does), so this function fills it in from there rather than
 * asking every caller to plumb it through.
 */
export type ApplicationPayload = {
  programId: string;
  applicantId?: string;
  eligibilityStatus: string;
  fields: Record<string, { value: string | number | boolean | null; source: string; confirmed: boolean }>;
  missingFields: string[];
  readyForPreview: boolean;
};

/**
 * Submits a validated payload as a DRAFT application.
 *
 * `form_version_id` is written `null`: `backend/`'s real form-payload generation never reads
 * `form_versions`/`form_fields` (confirmed — see `database/form_versions_investigation.md`), so
 * there is no real version row to reference, and the column was made nullable for exactly this
 * reason (`20260101000009_nullable_form_version_id.sql`).
 *
 * `programId` is matched against `benefit_programs.code` lowercased, since that column is seeded
 * lowercase (`scripts/push-catalogue.mjs`) to match the live NYC catalog provider's own id —
 * whatever case the caller passes (a catalogue.ts id is mixed-case; a value already read back
 * from the database is lowercase), this resolves the same way `programById`/`criteriaFor`/
 * `templateFor` now do.
 */
export async function submitApplication(
  programId: string,
  payload: ApplicationPayload,
): Promise<RepoOutcome<{ applicationId: string }>> {
  const db = supabase();
  if (!db) return { ok: false, reason: 'not-configured' };

  const applicant = await ensureApplicant();
  if (!applicant.ok) return { ok: false, reason: applicant.reason };

  const { data: benefitProgram, error: programError } = await db
    .from('benefit_programs')
    .select('id')
    .eq('code', programId.toLowerCase())
    .maybeSingle();
  if (programError) return { ok: false, reason: programError.message };
  if (!benefitProgram) return { ok: false, reason: `Unknown program: ${programId}.` };

  const { data: application, error: applicationError } = await db
    .from('applications')
    .insert({
      applicant_id: applicant.applicantId,
      benefit_program_id: benefitProgram.id,
      form_version_id: null,
      status: 'DRAFT',
      answers: { ...payload, applicantId: applicant.applicantId },
    })
    .select('id')
    .single();
  if (applicationError || !application) {
    return { ok: false, reason: applicationError?.message ?? 'Could not submit the application.' };
  }

  return { ok: true, data: { applicationId: application.id } };
}
