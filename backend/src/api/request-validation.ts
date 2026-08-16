import { validateProfile, type MockUserProfile } from '@/features/eligibility';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readProfile(value: unknown):
  | { profile: MockUserProfile }
  | { error: { code: 'INVALID_REQUEST' | 'INVALID_PROFILE'; message: string; fields?: string[] } } {
  if (!isRecord(value)) return { error: { code: 'INVALID_REQUEST', message: 'Request body must be an object.' } };
  if (!isRecord(value.profile)) return { error: { code: 'INVALID_REQUEST', message: 'Request body must include a profile object.', fields: ['profile'] } };
  if (typeof value.profile.id !== 'string') return { error: { code: 'INVALID_PROFILE', message: 'Profile id is required.', fields: ['id'] } };

  const profile = value.profile as unknown as MockUserProfile;
  const validation = validateProfile(profile);
  if (!validation.isValid) return { error: { code: 'INVALID_PROFILE', message: 'Profile contains invalid values.', fields: validation.issues } };
  return { profile };
}

export function readEligibilityResult(value: unknown): unknown | undefined {
  return isRecord(value) ? value.eligibilityResult : undefined;
}
