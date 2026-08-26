import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reading keys from `.env`, without a dependency for it.
 *
 * Matches the app's convention (`scripts/check-supabase.mjs:20-31`): a five-line parser rather
 * than a package, and an already-set environment variable always wins so a one-off
 * `GROQ_API_KEY=... npx tsx ...` is not silently overridden by a stale file.
 *
 * Two files are read, in order. `w2-eval/.env` is this project's own; the app's `.env` one level up
 * is read as a fallback purely so a Gemini key that already exists there does not have to be copied
 * — and copying a key between files is how one ends up committed.
 */
export async function loadEnv(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [resolve(here, '..', '.env'), resolve(here, '..', '..', '.env')];

  for (const path of candidates) {
    let raw: string;
    try {
      raw = await readFile(path, 'utf8');
    } catch {
      continue; // No .env is a valid state; the engines report their own missing keys.
    }

    for (const line of raw.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      const [, key, value] = match;
      if (key === undefined || value === undefined) continue;
      if (process.env[key] !== undefined) continue;
      process.env[key] = value.replace(/^["']|["']$/g, '');
    }
  }
}

/**
 * What is and is not configured, for the run banner.
 *
 * Printed before any fixture is touched, because discovering a missing key after twenty minutes of
 * API calls is a bad way to find out.
 */
export function describeKeys(): string[] {
  const keys = [
    { name: 'GEMINI_API_KEY', also: 'EXPO_PUBLIC_GEMINI_API_KEY', what: 'Track B — Gemini' },
    { name: 'GROQ_API_KEY', what: 'Track A LLM fallback, Track B — Groq vision' },
    { name: 'OCRSPACE_API_KEY', what: 'Track A — OCR.space' },
    { name: 'PADDLE_SIDECAR_URL', what: 'Track A — self-hosted PaddleOCR' },
    { name: 'OLLAMA_URL', what: 'Track B — local model (defaults to localhost:11434)' },
  ];

  return keys.map((key) => {
    const set = process.env[key.name] ?? (key.also ? process.env[key.also] : undefined);
    const mark = set ? 'set    ' : 'not set';
    return `  ${mark}  ${key.name.padEnd(20)} ${key.what}`;
  });
}

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURES = join(ROOT, 'fixtures');
