import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { redactForOutput } from '../core/schema.ts';
import type { ExtractionResult } from '../core/extractor.ts';

/**
 * Keeping every raw engine response so scoring never needs a second API call.
 *
 * Two reasons this matters more than it sounds. Free tiers rate-limit hard, so a scoring bug
 * discovered after a full run would otherwise cost another hour and another slice of quota. And
 * scoring has to be deterministic and re-runnable to be trustworthy: if the numbers change when
 * you re-run them, you cannot tell a fixed scorer from a flaky engine.
 *
 * The cache key covers the fixture and the engine config, so changing a prompt or a resolution
 * setting produces a new entry rather than silently returning the old one.
 */

export type CachedRun = {
  fixture: string;
  engine: string;
  result: ExtractionResult;
  /** Set when the run was replayed from cache rather than freshly called. */
  fromCache?: boolean;
};

function keyFor(fixture: string, engine: string): string {
  return createHash('sha256').update(`${fixture}::${engine}`).digest('hex').slice(0, 16);
}

function pathFor(rawDir: string, fixture: string, engine: string): string {
  const safe = engine.replace(/[^a-zA-Z0-9._@+-]/g, '_');
  return join(rawDir, safe, `${fixture}.${keyFor(fixture, engine)}.json`);
}

export async function readCached(
  rawDir: string,
  fixture: string,
  engine: string,
): Promise<ExtractionResult | null> {
  try {
    const text = await readFile(pathFor(rawDir, fixture, engine), 'utf8');
    return JSON.parse(text) as ExtractionResult;
  } catch {
    // A cache miss is the normal state on a first run and must not look like a failure.
    return null;
  }
}

/**
 * Writes one run to the cache, unless the engine never got an answer.
 *
 * Not caching failures is the whole point of the `failed` flag. A quota error, a 503, a key that
 * was not exported — cache one of those and that fixture is a permanent zero: every later run
 * replays the failure without retrying, and the report shows an engine scoring badly for a reason
 * that was fixed an hour ago. This was not hypothetical. Three fixtures hit a Gemini quota cap,
 * were cached as all-nulls, and then replayed as all-nulls through two subsequent runs after the
 * underlying problem was resolved.
 *
 * "Read the page and legitimately found nothing" is a different thing and is cached normally.
 *
 * `redactForOutput` runs here rather than in each engine, because a boundary every track has to
 * remember to honour is not a boundary. This is the only place an `ExtractionResult` reaches
 * disk, so it is the right place to enforce that an SSN never does.
 */
export async function writeCached(
  rawDir: string,
  fixture: string,
  engine: string,
  result: ExtractionResult,
): Promise<boolean> {
  if (result.failed === true) return false;

  const path = pathFor(rawDir, fixture, engine);
  await mkdir(dirname(path), { recursive: true });

  const safe: ExtractionResult = { ...result, fields: redactForOutput(result.fields) };
  await writeFile(path, `${JSON.stringify(safe, null, 2)}\n`, 'utf8');
  return true;
}

/**
 * Runs an engine, or replays it from cache.
 *
 * `--no-cache` forces a fresh call; `--replay` refuses to call out at all and scores only what is
 * already on disk, which is what you want when iterating on the scorer.
 */
/**
 * Every run on disk, as (fixture, engine, result).
 *
 * Reads the files rather than recomputing keys, because the directory name is the *sanitised*
 * engine string — `track-b_gemini_x` for an engine actually called `track-b:gemini:x` — and
 * hashing the sanitised form finds nothing. Each file carries its own engine name; that is the
 * authoritative one.
 */
export async function allCached(
  rawDir: string,
): Promise<{ fixture: string; engine: string; result: ExtractionResult }[]> {
  const out: { fixture: string; engine: string; result: ExtractionResult }[] = [];
  let dirs: string[];
  try {
    dirs = await readdir(rawDir);
  } catch {
    return out;
  }

  for (const dir of dirs) {
    let files: string[];
    try {
      files = await readdir(join(rawDir, dir));
    } catch {
      continue; // A file rather than an engine directory.
    }
    for (const file of files) {
      try {
        const result = JSON.parse(await readFile(join(rawDir, dir, file), 'utf8')) as ExtractionResult;
        out.push({ fixture: file.split('.')[0]!, engine: result.engine ?? dir, result });
      } catch {
        // A corrupt cache entry is not worth failing a whole re-score over.
      }
    }
  }

  return out;
}

export async function runOrReplay(
  options: {
    rawDir: string;
    fixture: string;
    engine: string;
    mode: 'normal' | 'no-cache' | 'replay';
  },
  call: () => Promise<ExtractionResult>,
): Promise<CachedRun | null> {
  const { rawDir, fixture, engine, mode } = options;

  if (mode !== 'no-cache') {
    const cached = await readCached(rawDir, fixture, engine);
    if (cached) return { fixture, engine, result: cached, fromCache: true };
  }

  if (mode === 'replay') return null;

  const result = await call();
  await writeCached(rawDir, fixture, engine, result);
  return { fixture, engine, result };
}
