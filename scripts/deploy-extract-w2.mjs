#!/usr/bin/env node
/**
 * Deploys the extract-w2 Edge Function and gives it the Gemini key.
 *
 *   npx supabase login          # once — this script cannot do it, the CLI needs a browser
 *   node scripts/deploy-extract-w2.mjs
 *
 * Exists because the function failing and the function being *absent* look identical from the app:
 * Supabase answers a missing function with a 404 that `supabase-js` reports as "Edge Function
 * returned a non-2xx status code". Deploying is two commands with two easy mistakes — the wrong
 * project ref, and forgetting the secret, which leaves a deployed function that 500s on every
 * request — so both happen here, in order, with the project ref read from the same .env the app
 * uses rather than typed again.
 *
 * The key is passed as a secret. It is deliberately read from EXPO_PUBLIC_GEMINI_API_KEY because
 * that is where this project keeps it today; note that the two are not equivalent. A secret set
 * here lives on Supabase and is readable only by the function. The EXPO_PUBLIC_ variable is inlined
 * into the app bundle at build time and is readable by anyone who downloads the app.
 */

import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function env() {
  const text = await readFile(join(root, '.env'), 'utf8').catch(() => {
    throw new Error('No .env file. Copy .env.example to .env and fill it in.');
  });
  return Object.fromEntries(
    text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const at = line.indexOf('=');
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      }),
  );
}

/** Streams the CLI's own output — its error messages are better than anything we could restate. */
function run(args) {
  const result = spawnSync('npx', ['--yes', 'supabase', ...args], { cwd: root, stdio: 'inherit' });
  return result.status === 0;
}

const vars = await env();

const url = vars.EXPO_PUBLIC_SUPABASE_URL;
if (!url) throw new Error('EXPO_PUBLIC_SUPABASE_URL is not set in .env.');

// https://<ref>.supabase.co -- the ref is the project, and the CLI wants it on its own.
const ref = new URL(url).hostname.split('.')[0];

const key = vars.EXPO_PUBLIC_GEMINI_API_KEY;
if (!key) throw new Error('EXPO_PUBLIC_GEMINI_API_KEY is not set in .env — the function needs it.');

console.log(`project ${ref}\n`);

console.log('1/2  setting the GEMINI_API_KEY secret');
if (!run(['secrets', 'set', `GEMINI_API_KEY=${key}`, '--project-ref', ref])) {
  console.error('\nFailed. If it asked for an access token, run `npx supabase login` first.');
  process.exit(1);
}

console.log('\n2/2  deploying extract-w2');
if (!run(['functions', 'deploy', 'extract-w2', '--project-ref', ref])) {
  process.exit(1);
}

console.log(`\nDeployed. Verify it refuses an unauthenticated caller:`);
console.log(`  curl -i -X POST ${url}/functions/v1/extract-w2 -d '{}'`);
console.log('Expect 401. Then open the Scan tab in Expo Go.');
