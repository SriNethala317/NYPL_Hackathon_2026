// Must be imported before the client: supabase-js parses URLs, and React Native's URL
// implementation is incomplete without this.
import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { sessionStorage } from './session-storage';

/**
 * The Supabase connection, if one has been configured.
 *
 * Everything in this app works without it — the catalogue is bundled, screening runs locally, and
 * state lives in memory. Supabase adds persistence and accounts on top; it is not a prerequisite,
 * and the app must never break because the keys are absent.
 *
 * `isConfigured()` is the gate every caller checks. Nothing here throws on a missing key, because
 * a benefits app that white-screens when an env var is unset is worse than one that forgets your
 * documents between launches.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Only ever the anon key.
 *
 * The service role key bypasses every row-level policy in `0001_initial.sql`. In a client bundle
 * it is readable by anyone who downloads the app, which would make the whole RLS design
 * decorative. Server-side work belongs in an Edge Function.
 */
let client: SupabaseClient | null = null;

export function isConfigured(): boolean {
  return Boolean(url && anonKey);
}

export function supabase(): SupabaseClient | null {
  if (!isConfigured()) return null;
  if (!client) {
    client = createClient(url as string, anonKey as string, {
      auth: {
        /*
         * The session token is a bearer credential for somebody's benefits data, so it goes in
         * the Keychain/Keystore rather than unencrypted AsyncStorage. See session-storage.ts.
         */
        storage: sessionStorage,
        // No URL session detection: this is a native app, not a browser redirect flow.
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return client;
}

/** What the app can do right now, so the UI can describe reality rather than intent. */
export type BackendStatus = {
  configured: boolean;
  /** True once a user is signed in and row-level policies have somebody to scope to. */
  authenticated: boolean;
  detail: string;
};

export async function backendStatus(): Promise<BackendStatus> {
  const db = supabase();
  if (!db) {
    return {
      configured: false,
      authenticated: false,
      detail:
        'No Supabase project is connected. Your details are kept only while the app is open.',
    };
  }

  const { data } = await db.auth.getSession();
  return {
    configured: true,
    authenticated: Boolean(data.session),
    detail: data.session
      ? 'Signed in. Your details are saved to your account.'
      : 'Connected, but not signed in. Your details are kept only while the app is open.',
  };
}
