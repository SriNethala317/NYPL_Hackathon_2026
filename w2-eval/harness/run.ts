import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Extractor, ExtractionResult } from '../core/extractor.ts';
import { emptyFields, W2Fields } from '../core/schema.ts';
import { runOrReplay } from './cache.ts';
import { describeKeys, loadEnv } from './env.ts';
import { renderReport, type EngineRun } from './report.ts';
import { scoreExtraction } from './score.ts';

/**
 * The runner.
 *
 * Walks a fixture directory, puts each image through every configured engine, scores the result
 * against that fixture's ground truth, and writes a report.
 *
 * ## Why tracks are imported dynamically
 *
 * Each track is developed on its own branch, so a checkout normally contains one of them and not
 * the other. A static `import` of both would fail to resolve on either branch. The dynamic import
 * behind `--track` means a missing track is a clear sentence rather than a module-resolution
 * stack trace, and it is also what lets the harness run with nothing configured at all — which
 * the eval spec requires and which is the first thing worth testing.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

type Mode = 'normal' | 'no-cache' | 'replay';

type Options = {
  tracks: ('a' | 'b')[];
  engines: string[];
  input: string;
  out: string;
  vlm?: string;
  ocr?: string;
  resolutions?: string[];
  selfConsistency: boolean;
  mode: Mode;
};

function parseArgs(argv: readonly string[]): Options {
  const get = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const list = (flag: string): string[] =>
    (get(flag) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const tracks = [...list('--track'), ...list('--tracks')].filter(
    (t): t is 'a' | 'b' => t === 'a' || t === 'b',
  );

  return {
    tracks,
    engines: list('--engines'),
    input: get('--input') ?? join(ROOT, 'fixtures'),
    out: get('--out') ?? join(ROOT, 'results'),
    vlm: get('--vlm'),
    ocr: get('--ocr'),
    resolutions: list('--resolution').length > 0 ? list('--resolution') : undefined,
    selfConsistency: argv.includes('--self-consistency'),
    mode: argv.includes('--no-cache') ? 'no-cache' : argv.includes('--replay') ? 'replay' : 'normal',
  };
}

/**
 * An engine that reads nothing, for proving the scorer punishes silence.
 *
 * Kept in the harness rather than in a track because it belongs to neither and must survive on
 * both branches. `--engines stub-null` is the gate described in the plan: if this scores positive,
 * every number produced afterwards is meaningless.
 */
const stubNull: Extractor = {
  name: 'stub-null',
  async extract(): Promise<ExtractionResult> {
    return {
      fields: emptyFields(),
      fieldConfidence: {},
      latencyMs: 0,
      costUsd: 0,
      engine: 'stub-null',
      raw: null,
      warnings: ['Stub engine: reads nothing. Present to verify the scorer, never to be compared.'],
    };
  },
};

/**
 * Loads a track's extractors, or explains why it cannot.
 *
 * Returns a reason rather than throwing, so one missing track never stops the other from being
 * scored.
 */
async function loadTrack(
  track: 'a' | 'b',
  options: Options,
): Promise<{ extractors: Extractor[] } | { reason: string }> {
  const dir = track === 'a' ? 'a-ocr-llm' : 'b-vlm';
  const entry = join(ROOT, 'tracks', dir, 'index.ts');

  if (!existsSync(entry)) {
    return {
      reason:
        `track ${track} is not present on this branch (no tracks/${dir}/index.ts). ` +
        `It is developed on \`track-${track === 'a' ? 'a-ocr-llm' : 'b-vlm'}\`; ` +
        `merge that branch to score both together.`,
    };
  }

  try {
    const module = (await import(entry)) as {
      createExtractors?: (options: Options) => Extractor[] | Promise<Extractor[]>;
    };
    if (typeof module.createExtractors !== 'function') {
      return { reason: `tracks/${dir}/index.ts does not export createExtractors()` };
    }
    return { extractors: await module.createExtractors(options) };
  } catch (error) {
    return { reason: `track ${track} failed to load: ${String(error)}` };
  }
}

/**
 * Collapses a provider error to one readable line.
 *
 * A four-model cascade failing on quota produces four near-identical 300-character JSON blobs,
 * which is four times as much text and no more information than one sentence.
 */
function summarise(warning: string): string {
  const flat = warning.replace(/\s+/g, ' ');
  const status = flat.match(/returned (\d{3})/)?.[1];
  const message = flat.match(/"message":\s*"([^"]{0,120})/)?.[1];
  if (status && message) return `HTTP ${status}: ${message.trim()}`;
  return flat.length > 160 ? `${flat.slice(0, 160)}…` : flat;
}

/** Whether a failure means "out of quota" rather than "went too fast" or "one bad request". */
function isExhausted(warnings: readonly string[]): boolean {
  return warnings.some((w) => /429/.test(w) && /quota|billing/i.test(w));
}

type Fixture = { name: string; image: string; truth: W2Fields };

/**
 * Reads the corpus.
 *
 * A fixture is an image with a `.truth.json` beside it. An image without one is reported and
 * skipped rather than scored against nothing — scoring an extraction against an absent truth
 * would classify every field it read as a hallucination.
 */
async function loadFixtures(dir: string): Promise<{ fixtures: Fixture[]; problems: string[] }> {
  const fixtures: Fixture[] = [];
  const problems: string[] = [];

  if (!existsSync(dir)) {
    return { fixtures, problems: [`fixture directory ${dir} does not exist`] };
  }

  const entries = await readdir(dir);
  const images = entries.filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();

  for (const image of images) {
    const name = image.replace(/\.(png|jpe?g)$/i, '');
    const truthPath = join(dir, `${name}.truth.json`);
    if (!existsSync(truthPath)) {
      problems.push(`${image} has no ${name}.truth.json — not scored`);
      continue;
    }
    try {
      const parsed = W2Fields.parse(JSON.parse(await readFile(truthPath, 'utf8')));
      fixtures.push({ name, image: join(dir, image), truth: parsed });
    } catch (error) {
      problems.push(`${name}.truth.json does not match the schema: ${String(error)}`);
    }
  }

  return { fixtures, problems };
}

async function main(): Promise<void> {
  await loadEnv();

  const options = parseArgs(process.argv.slice(2));

  // Printed before a single fixture is touched: finding out a key is missing after twenty minutes
  // of API calls is a bad way to find out.
  console.log('Configuration:');
  for (const line of describeKeys()) console.log(line);
  console.log('');
  const runs: EngineRun[] = [];
  const skipped: { engine: string; reason: string }[] = [];

  const { fixtures, problems } = await loadFixtures(options.input);
  for (const problem of problems) skipped.push({ engine: 'fixtures', reason: problem });

  // Assemble the engine list before touching a fixture, so a misconfiguration is reported up
  // front rather than after twenty minutes of API calls.
  const extractors: { track: 'a' | 'b'; extractor: Extractor }[] = [];

  if (options.engines.includes('stub-null')) {
    extractors.push({ track: 'a', extractor: stubNull });
  }

  for (const track of options.tracks) {
    const loaded = await loadTrack(track, options);
    if ('reason' in loaded) {
      skipped.push({ engine: `track-${track}`, reason: loaded.reason });
      continue;
    }
    for (const extractor of loaded.extractors) extractors.push({ track, extractor });
  }

  if (extractors.length === 0) {
    console.log('No engines configured. Nothing to run.');
    for (const item of skipped) console.log(`  skipped: ${item.engine} — ${item.reason}`);
  }

  const rawDir = join(options.out, 'raw');

  /*
   * An engine that has run out of quota is done for this run.
   *
   * Without this, a Gemini daily cap hit on fixture five means twelve more fixtures each try four
   * models and fail four times — 48 pointless calls, several minutes of waiting, and a wall of
   * identical errors to read through. The quota does not come back within a run, so the only thing
   * continuing buys is a longer way to find out.
   */
  const exhausted = new Map<string, string>();

  for (const fixture of fixtures) {
    for (const { track, extractor } of extractors) {
      const label = `${extractor.name} on ${fixture.name}`;

      const already = exhausted.get(extractor.name);
      if (already !== undefined) {
        skipped.push({ engine: extractor.name, reason: `${fixture.name}: ${already}` });
        continue;
      }

      try {
        const run = await runOrReplay(
          { rawDir, fixture: fixture.name, engine: extractor.name, mode: options.mode },
          () => extractor.extract(fixture.image),
        );

        if (run === null) {
          skipped.push({ engine: extractor.name, reason: `${fixture.name}: no cached run to replay` });
          continue;
        }

        runs.push({
          engine: extractor.name,
          track,
          fixture: fixture.name,
          scores: scoreExtraction(run.result.fields, fixture.truth, run.result.fieldConfidence),
          result: run.result,
          fromCache: run.fromCache === true,
        });
        const state = run.result.failed === true ? 'FAILED' : run.fromCache ? 'cached' : 'ran   ';
        console.log(`  ${state}  ${label}`);
        if (run.result.failed === true) {
          // Not cached, so the next run retries it. Say so, or a red line looks permanent.
          const detail = summarise(run.result.warnings[0] ?? 'no detail');
          console.log(`          ${detail} — not cached, will retry next run`);
          if (isExhausted(run.result.warnings)) {
            exhausted.set(extractor.name, 'skipped: engine out of quota for this run');
            console.log(`          quota exhausted; skipping ${extractor.name} for the rest of this run`);
          }
        }
      } catch (error) {
        // An engine that throws is a bug in that engine, not a reason to lose the whole run.
        skipped.push({ engine: extractor.name, reason: `${fixture.name}: threw — ${String(error)}` });
        console.log(`  failed  ${label}: ${String(error)}`);
      }
    }
  }

  await mkdir(options.out, { recursive: true });

  const report = renderReport({
    runs,
    skipped,
    fixtureNote:
      '**Fixtures are rendered, not photographed.** Ground truth is authored first and the image ' +
      'rendered from it, so the truth never passes through an extractor. But a synthetic image ' +
      'that was never printed lacks real capture artefacts — genuine skew, focus falloff, paper ' +
      'texture — and both tracks will therefore score higher here than on a photograph of a real ' +
      'form. Treat these numbers as an upper bound.',
  });

  const reportPath = options.out.endsWith('.md') ? options.out : join(options.out, 'report.md');
  await writeFile(reportPath, report, 'utf8');

  const perFixture = join(options.out, 'scores.json');
  await writeFile(
    perFixture,
    `${JSON.stringify(
      runs.map((r) => ({ engine: r.engine, fixture: r.fixture, scores: r.scores })),
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log(`\n${runs.length} runs scored. Report: ${reportPath}`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} skipped — listed in the report under "Not run".`);
  }
}

// `basename` guards against this firing when the module is imported by a test.
if (basename(process.argv[1] ?? '') === 'run.ts') {
  await main();
}

export { loadFixtures, parseArgs, stubNull };
