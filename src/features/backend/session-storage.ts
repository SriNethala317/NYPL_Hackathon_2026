import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Where the Supabase session token lives on this device.
 *
 * The token is a bearer credential for somebody's benefits data — their address, income and
 * household. `AsyncStorage`, which the Supabase docs suggest, is unencrypted: on a rooted or
 * jailbroken device, or through a backup, it is readable. For this app that is the wrong default,
 * so the token goes in the Keychain on iOS and the Keystore on Android instead.
 *
 * The catch is a hard iOS limit of roughly 2KB per SecureStore value, and a Supabase session
 * (access token plus refresh token plus user object) routinely exceeds it. So values are split
 * across numbered chunks with a small index, and reassembled on read.
 *
 * Web keeps the browser's own `localStorage`, which is what supabase-js already uses there.
 */

const CHUNK_SIZE = 1800; // Comfortably under the ~2048-byte iOS ceiling.
const COUNT_SUFFIX = '__chunks';

/** SecureStore keys must be alphanumeric, '.', '-' or '_'. Supabase keys can contain others. */
function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

async function setChunked(key: string, value: string): Promise<void> {
  const base = safeKey(key);
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    chunks.push(value.slice(i, i + CHUNK_SIZE));
  }

  // Written before the chunks, so a partial write is detectable rather than silently truncated.
  await SecureStore.setItemAsync(`${base}${COUNT_SUFFIX}`, String(chunks.length));
  await Promise.all(chunks.map((chunk, i) => SecureStore.setItemAsync(`${base}.${i}`, chunk)));
}

async function getChunked(key: string): Promise<string | null> {
  const base = safeKey(key);
  const countRaw = await SecureStore.getItemAsync(`${base}${COUNT_SUFFIX}`);
  if (!countRaw) return null;

  const count = Number(countRaw);
  if (!Number.isInteger(count) || count < 1) return null;

  const parts = await Promise.all(
    Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${base}.${i}`)),
  );

  // A missing chunk means a half-written session. Returning a truncated token would fail in a
  // confusing way later; treating it as absent makes the app sign in again, which works.
  if (parts.some((part) => part === null)) return null;
  return parts.join('');
}

async function removeChunked(key: string): Promise<void> {
  const base = safeKey(key);
  const countRaw = await SecureStore.getItemAsync(`${base}${COUNT_SUFFIX}`);
  const count = Number(countRaw ?? 0);

  await Promise.all([
    SecureStore.deleteItemAsync(`${base}${COUNT_SUFFIX}`),
    ...Array.from({ length: Number.isInteger(count) ? count : 0 }, (_, i) =>
      SecureStore.deleteItemAsync(`${base}.${i}`),
    ),
  ]);
}

/**
 * The storage adapter supabase-js expects.
 *
 * Falls back to AsyncStorage if the secure store is unavailable — some Android devices without a
 * lock screen have no Keystore. An unencrypted session is worse than an encrypted one and better
 * than an app that cannot sign in at all.
 */
export const sessionStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return AsyncStorage.getItem(key);
    try {
      return await getChunked(key);
    } catch {
      return AsyncStorage.getItem(key);
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') return AsyncStorage.setItem(key, value);
    try {
      await setChunked(key, value);
    } catch {
      await AsyncStorage.setItem(key, value);
    }
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') return AsyncStorage.removeItem(key);
    try {
      await removeChunked(key);
    } catch {
      await AsyncStorage.removeItem(key);
    }
  },
};
