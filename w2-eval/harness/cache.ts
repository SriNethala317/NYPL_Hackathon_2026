import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
 * Writes one run to the cache.
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
): Promise<void> {
  const path = pathFor(rawDir, fixture, engine);
  await mkdir(dirname(path), { recursive: true });

  const safe: ExtractionResult = { ...result, fields: redactForOutput(result.fields) };
  await writeFile(path, `${JSON.stringify(safe, null, 2)}\n`, 'utf8');
}

/**
 * Runs an engine, or replays it from cache.
 *
 * `--no-cache` forces a fresh call; `--replay` refuses to call out at all and scores only what is
 * already on disk, which is what you want when iterating on the scorer.
 */
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
