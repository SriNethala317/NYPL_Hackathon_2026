import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import type { ExtractionResult } from '../core/extractor.ts';
import { emptyFields, W2Fields } from '../core/schema.ts';
import { readCached, runOrReplay, writeCached } from './cache.ts';

/**
 * The cache is the only place an extraction reaches disk, which makes it the only place worth
 * enforcing that an SSN does not. These tests exist because "every engine remembers to redact" is
 * not a guarantee, it is a hope.
 */

function resultWith(overrides: Partial<W2Fields>): ExtractionResult {
  return {
    fields: W2Fields.parse({ ...emptyFields(), ...overrides }),
    fieldConfidence: { box1_wages: 0.9 },
    latencyMs: 120,
    costUsd: 0,
    engine: 'test',
    raw: { note: 'upstream payload' },
    warnings: [],
  };
}

async function inTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'w2-cache-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('a cached run never contains the SSN or EIN the engine read', async () => {
  await inTempDir(async (dir) => {
    await writeCached(
      dir,
      'fixture-1',
      'test',
      resultWith({
        employee_ssn: '900-99-1234',
        employer_ein: '13-4567890',
        employee_name: 'MARIA REYES',
        box1_wages: '27720.00',
      }),
    );

    const files = await readdir(join(dir, 'test'));
    const written = await readFile(join(dir, 'test', files[0]!), 'utf8');

    assert.ok(!written.includes('900-99-1234'), 'SSN reached disk');
    assert.ok(!written.includes('13-4567890'), 'EIN reached disk');

    // Redaction must not cost the fields the comparison actually needs.
    assert.ok(written.includes('MARIA REYES'));
    assert.ok(written.includes('27720.00'));
  });
});

test('a run is replayed from cache rather than called twice', async () => {
  await inTempDir(async (dir) => {
    let calls = 0;
    const call = async () => {
      calls += 1;
      return resultWith({ box1_wages: '27720.00' });
    };

    const first = await runOrReplay({ rawDir: dir, fixture: 'f', engine: 'e', mode: 'normal' }, call);
    const second = await runOrReplay({ rawDir: dir, fixture: 'f', engine: 'e', mode: 'normal' }, call);

    assert.equal(calls, 1, 'the engine should only have been called once');
    assert.equal(first?.fromCache, undefined);
    assert.equal(second?.fromCache, true);
    assert.equal(second?.result.fields.box1_wages, '27720.00');
  });
});

test('replay mode refuses to call out at all', async () => {
  await inTempDir(async (dir) => {
    let calls = 0;
    const run = await runOrReplay({ rawDir: dir, fixture: 'f', engine: 'e', mode: 'replay' }, async () => {
      calls += 1;
      return resultWith({});
    });

    // Nothing cached and nothing called: the runner reports it and scores what it has.
    assert.equal(run, null);
    assert.equal(calls, 0);
  });
});

test('changing the engine config produces a new cache entry, not a stale hit', async () => {
  await inTempDir(async (dir) => {
    // A resolution or prompt change shows up in the engine string; it must not silently replay.
    await writeCached(dir, 'f', 'track-b:gemini@low', resultWith({ box1_wages: '1.00' }));

    assert.equal((await readCached(dir, 'f', 'track-b:gemini@low'))?.fields.box1_wages, '1.00');
    assert.equal(await readCached(dir, 'f', 'track-b:gemini@high'), null);
  });
});

test('a failed run is never cached, so the next run retries it', async () => {
  await inTempDir(async (dir) => {
    // Measured, not imagined: three fixtures hit a Gemini quota cap, were cached as all-nulls, and
    // replayed as all-nulls through two later runs after the quota had recovered.
    const failure = { ...resultWith({}), failed: true, warnings: ['429 quota exceeded'] };

    const wrote = await writeCached(dir, 'f', 'e', failure);
    assert.equal(wrote, false);
    assert.equal(await readCached(dir, 'f', 'e'), null);

    let calls = 0;
    await runOrReplay({ rawDir: dir, fixture: 'f', engine: 'e', mode: 'normal' }, async () => {
      calls += 1;
      return failure;
    });
    await runOrReplay({ rawDir: dir, fixture: 'f', engine: 'e', mode: 'normal' }, async () => {
      calls += 1;
      return resultWith({ box1_wages: '27720.00' });
    });

    assert.equal(calls, 2, 'the second run must retry rather than replay the failure');
    assert.equal((await readCached(dir, 'f', 'e'))?.fields.box1_wages, '27720.00');
  });
});

test('an engine that read the page and found nothing is still cached', async () => {
  await inTempDir(async (dir) => {
    // A legitimate all-nulls read is a result, not a failure, and re-calling for it wastes quota.
    assert.equal(await writeCached(dir, 'f', 'e', resultWith({})), true);
    assert.notEqual(await readCached(dir, 'f', 'e'), null);
  });
});

test('a cache miss is a normal state, not a failure', async () => {
  await inTempDir(async (dir) => {
    assert.equal(await readCached(dir, 'never-written', 'nobody'), null);
  });
});
