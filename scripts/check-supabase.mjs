#!/usr/bin/env node
/**
 * Checks a Supabase project is set up correctly, one step at a time.
 *
 *   node scripts/check-supabase.mjs
 *
 * Reads EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY from .env. Uses only the
 * publishable/anon key, so it verifies exactly what the app itself can do — a check that passed
 * with elevated credentials would prove nothing about whether the app works.
 *
 * Each failure prints the specific fix rather than a status code.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/** Minimal .env reader — no dependency needed for five lines of KEY=value. */
async function loadEnv() {
  try {
    const raw = await readFile(join(here, '..', '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {
    /* no .env is a valid state; the check below reports it */
  }
}

await loadEnv();

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const pass = (msg) => console.log(`  ok    ${msg}`);
const fail = (msg, fix) => {
  console.log(`  FAIL  ${msg}`);
  if (fix) console.log(`        → ${fix}`);
  failures += 1;
};
let failures = 0;

console.log('\nSupabase setup check\n');

if (!url || !key) {
  fail(
    'EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY not set',
    'Copy .env.example to .env and fill both in.',
  );
  process.exit(1);
}
pass(`credentials found (${new URL(url).hostname})`);

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

// 1. Is the project reachable at all?
try {
  const health = await fetch(`${url}/auth/v1/health`, { headers });
  health.ok ? pass('project reachable') : fail(`auth health returned ${health.status}`);
} catch (error) {
  fail(`cannot reach the project: ${error.message}`, 'Check the URL is correct and you are online.');
}

// 2. Has the migration been applied?
const programs = await fetch(`${url}/rest/v1/programs?select=id&limit=1`, { headers });
if (programs.status === 404 || programs.status === 400) {
  const body = await programs.text();
  fail(
    'the `programs` table does not exist',
    'Apply supabase/migrations/0001_initial.sql — paste it into the SQL editor and run it.',
  );
  if (process.env.VERBOSE) console.log(`        ${body.slice(0, 160)}`);
} else if (!programs.ok) {
  fail(`reading programs returned ${programs.status}`, await programs.text());
} else {
  pass('migration applied — `programs` is readable');
}

// 3. Is the catalogue loaded?
const counted = await fetch(`${url}/rest/v1/programs?select=id`, {
  headers: { ...headers, Prefer: 'count=exact', Range: '0-0' },
});
if (counted.ok) {
  const total = Number(counted.headers.get('content-range')?.split('/')[1] ?? 0);
  total > 0
    ? pass(`catalogue loaded (${total} programmes)`)
    : fail(
        'catalogue is empty',
        'Run: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/push-catalogue.mjs',
      );
}

// 4. Can the app get an identity for row-level security to scope to?
const signIn = await fetch(`${url}/auth/v1/signup`, { method: 'POST', headers, body: '{}' });
if (signIn.ok) {
  pass('anonymous sign-in works');
} else {
  const body = await signIn.json().catch(() => ({}));
  if (body.error_code === 'anonymous_provider_disabled') {
    fail(
      'anonymous sign-in is disabled',
      'Authentication → Providers → Anonymous sign-ins → enable. Nothing persists without it, because every RLS policy is scoped to auth.uid().',
    );
  } else {
    fail(`sign-in returned ${signIn.status}: ${body.msg ?? ''}`);
  }
}

// 5. Are the private tables actually protected?
const leak = await fetch(`${url}/rest/v1/profile_fields?select=id&limit=1`, { headers });
if (leak.status === 200) {
  const rows = await leak.json();
  Array.isArray(rows) && rows.length === 0
    ? pass('private tables return nothing without a session (RLS active)')
    : fail('private data is readable without signing in', 'Check RLS is enabled on profile_fields.');
} else if (leak.status === 401 || leak.status === 403) {
  pass('private tables reject unauthenticated reads (RLS active)');
} else if (leak.status === 404) {
  // Already reported by step 2.
} else {
  fail(`profile_fields returned ${leak.status}`);
}

console.log(
  failures === 0
    ? '\nAll checks passed — the app can persist data.\n'
    : `\n${failures} step(s) need attention.\n`,
);
process.exit(failures === 0 ? 0 : 1);
