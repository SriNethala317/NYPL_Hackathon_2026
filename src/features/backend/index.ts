export { backendStatus, isConfigured, supabase, type BackendStatus } from './supabase';
export { ensureSession, linkEmail, signOut, type AuthOutcome, type Session } from './auth';
export {
  checkBackend,
  deleteMyData,
  loadProfile,
  saveDocument,
  type PersistedDocument,
  type PersistedProfile,
  type RepoOutcome,
} from './profile-repository';
export { submitApplication, type ApplicationPayload } from './application-repository';
