import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MONETARY_FIELDS, W2Fields } from '../core/schema.ts';
import { valuesAgree } from '../core/normalize.ts';
import { accuracy, byTier, composite, scoreExtraction, tally, type FieldScore } from './score.ts';

/**
 * What each engine actually read, against what is printed on the page.
 *
 * The report answers "which engine is better". This answers the question you have to settle
 * first — *what did it put in the box, and was that the number on the form* — because a composite
 * score cannot tell you that a model swapped two columns, and an aggregate accuracy figure hides
 * the difference between "off by a digit" and "invented a row that isn't there".
 *
 * Reads only the cache, so it never calls an API and can be run as often as you like:
 *
 *     npx tsx harness/inspect.ts                    # every fixture, every engine
 *     npx tsx harness/inspect.ts adp-clean          # one fixture in full
 *     npx tsx harness/inspect.ts --needed           # only the fields the screener consumes
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'results', 'raw');
const CASES = join(ROOT, 'test-cases');

/** The fields the NYC screener can actually use from a W-2. Everything else is bookkeeping. */
const NEEDED = [
  'box5_medicare_wages',
  'box1_wages',
  'employee_address',
  'employee_name',
  'tax_year',
] as const;

const SUMMARY = [
  'box1_wages',
  'box3_ss_wages',
  'box5_medicare_wages',
  'box2_federal_tax',
  'box4_ss_tax',
  'box6_medicare_tax',
  'tax_year',
  'employee_name',
  'employer_name',
] as const;

type Run = { fields: W2Fields; conf: Record<string, number>; latencyMs: number; warnings: string[] };

function loadRuns(): Map<string, Map<string, Run>> {
  const byEngine = new Map<string, Map<string, Run>>();
  if (!existsSync(RAW)) return byEngine;

  for (const engine of readdirSync(RAW)) {
    const runs = new Map<string, Run>();
    for (const file of readdirSync(join(RAW, engine))) {
      const fixture = file.split('.')[0]!;
      const d = JSON.parse(readFileSync(join(RAW, engine, file), 'utf8'));
      runs.set(fixture, {
        fields: W2Fields.parse(d.fields),
        conf: d.fieldConfidence ?? {},
        latencyMs: d.latencyMs ?? 0,
        warnings: d.warnings ?? [],
      });
    }
    byEngine.set(engine, runs);
  }
  return byEngine;
}

/** Ground truth for a case, from either corpus layout. */
function truthFor(fixture: string): W2Fields | null {
  for (const path of [
    join(CASES, fixture, 'expected.json'),
    join(CASES, `${fixture}.truth.json`),
    join(ROOT, 'fixtures', `${fixture}.truth.json`),
  ]) {
    if (existsSync(path)) return W2Fields.parse(JSON.parse(readFileSync(path, 'utf8')));
  }
  return null;
}

const short = (e: string) =>
  e.replace('track-b_', '').replace('track-a_', '').replace('@mid', '').replace(/_/g, ':');

const cut = (v: unknown, n: number) => {
  const t = v === null || v === undefined ? '—' : String(v);
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

function main(): void {
  const args = process.argv.slice(2);
  const onlyNeeded = args.includes('--needed');
  const only = args.find((a) => !a.startsWith('--'));

  const byEngine = loadRuns();
  if (byEngine.size === 0) {
    console.log(`No cached runs in ${RAW}. Run the harness first.`);
    return;
  }

  const fields = onlyNeeded ? NEEDED : SUMMARY;
  const fixtures = [...new Set([...byEngine.values()].flatMap((m) => [...m.keys()]))]
    .filter((f) => only === undefined || f === only)
    .sort();

  if (fixtures.length === 0) {
    console.log(`No cached run for "${only}".`);
    return;
  }

  console.log('\n════ WHAT EACH ENGINE READ, VERSUS WHAT IS PRINTED ════\n');

  for (const fixture of fixtures) {
    const truth = truthFor(fixture);
    if (truth === null) continue;

    const present = [...byEngine.entries()].filter(([, m]) => m.has(fixture));
    if (present.length === 0) continue;

    console.log(`── ${fixture} ${'─'.repeat(Math.max(0, 58 - fixture.length))}`);
    console.log(
      'field'.padEnd(21) +
        'ON THE FORM'.padEnd(22) +
        present.map(([e]) => cut(short(e), 20).padEnd(22)).join(''),
    );

    // When a single fixture is named, show every field it has an opinion about, not just the
    // summary set — that is the whole reason to ask about one fixture.
    const rows = only === undefined ? [...fields] : detailFields(truth, present.map(([, m]) => m.get(fixture)!));

    for (const f of rows) {
      const want = truth[f as keyof W2Fields];
      let line = `${f.padEnd(21)}${cut(want, 20).padEnd(22)}`;
      for (const [, runs] of present) {
        const got = runs.get(fixture)!.fields[f as keyof W2Fields];
        const same = String(got ?? '—') === String(want ?? '—');
        line += `${(cut(got, 18) + (same ? '' : '  ✗')).padEnd(22)}`;
      }
      console.log(line);
    }

    let scoreLine = `${'→'.padEnd(21)}${''.padEnd(22)}`;
    for (const [, runs] of present) {
      const r = runs.get(fixture)!;
      const s = scoreExtraction(r.fields, truth, r.conf);
      const crit = byTier(s, 'critical');
      scoreLine += `${`${composite(s)}pts ${Math.round(accuracy(s) * 100)}% crit ${Math.round(accuracy(crit) * 100)}%`.padEnd(22)}`;
    }
    console.log(scoreLine);

    for (const [e, runs] of present) {
      for (const w of runs.get(fixture)!.warnings.filter((x) => /mismatch|exceeded|box12/.test(x)).slice(0, 3)) {
        console.log(`   ! ${cut(short(e), 18)}: ${w.slice(0, 92)}`);
      }
    }
    console.log('');
  }

  totals(byEngine, onlyNeeded);
}

/** Every scalar field either the truth or some engine has a value for. */
function detailFields(truth: W2Fields, runs: Run[]): string[] {
  const keys = new Set<string>();
  for (const [k, v] of Object.entries(truth)) if (!Array.isArray(v) && v !== null) keys.add(k);
  for (const r of runs) {
    for (const [k, v] of Object.entries(r.fields)) if (!Array.isArray(v) && v !== null) keys.add(k);
  }
  return [...keys].sort();
}

function totals(byEngine: Map<string, Map<string, Run>>, onlyNeeded: boolean): void {
  console.log('════ TOTALS ════\n');
  console.log(
    'engine'.padEnd(26) +
      'docs'.padEnd(6) +
      'score'.padEnd(8) +
      'all'.padEnd(6) +
      'crit'.padEnd(7) +
      'over'.padEnd(6) +
      'wrong'.padEnd(7) +
      'halluc'.padEnd(8) +
      'missed'.padEnd(8) +
      'avg s',
  );

  for (const [engine, runs] of byEngine) {
    const all: FieldScore[] = [];
    let ms = 0;
    let needed = { ok: 0, total: 0 };

    for (const [fixture, r] of runs) {
      const truth = truthFor(fixture);
      if (truth === null) continue;
      all.push(...scoreExtraction(r.fields, truth, r.conf));
      ms += r.latencyMs;

      for (const k of NEEDED) {
        const want = truth[k];
        if (want === null) continue;
        needed.total += 1;
        // Normalised, exactly as the scorer compares — "1234" and "1234.00" are the same answer,
        // and a strict string match here would report a different number than the report does.
        if (valuesAgree(k, want, r.fields[k], MONETARY_FIELDS.has(k))) needed.ok += 1;
      }
    }

    const t = tally(all);
    console.log(
      short(engine).padEnd(26) +
        String(runs.size).padEnd(6) +
        String(composite(all)).padEnd(8) +
        `${Math.round(accuracy(all) * 100)}%`.padEnd(6) +
        `${Math.round(accuracy(byTier(all, 'critical')) * 100)}%`.padEnd(7) +
        String(t.wrong_over).padEnd(6) +
        String(t.wrong).padEnd(7) +
        String(t.hallucinated).padEnd(8) +
        String(t.missed).padEnd(8) +
        Math.round(ms / Math.max(1, runs.size) / 1000),
    );

    if (onlyNeeded) {
      console.log(
        `${''.padEnd(26)}the four screener fields: ${needed.ok}/${needed.total} ` +
          `(${Math.round((needed.ok / Math.max(1, needed.total)) * 100)}%)`,
      );
    }
  }
  console.log('');
}

main();
