import type { ExtractionResult } from '../core/extractor.ts';
import {
  accuracy,
  byTier,
  calibration,
  composite,
  tally,
  type FieldScore,
  type Tier,
} from './score.ts';

/**
 * Writing the thing a decision gets made from.
 *
 * Ordered deliberately: the failure gallery comes before the aggregates, because a composite score
 * is exactly the kind of number that ends an argument without settling it. Reading the actual
 * wrong values first tends to change what you conclude from the table underneath.
 */

export type EngineRun = {
  engine: string;
  track: 'a' | 'b';
  fixture: string;
  scores: FieldScore[];
  result: ExtractionResult;
  fromCache: boolean;
};

export type ReportInput = {
  runs: EngineRun[];
  /** Engines that were configured but produced nothing, and why. Never silently omitted. */
  skipped: { engine: string; reason: string }[];
  fixtureNote: string;
};

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function money(value: number): string {
  return value === 0 ? '$0' : `$${value.toFixed(4)}`;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index] ?? 0;
}

function groupByEngine(runs: readonly EngineRun[]): Map<string, EngineRun[]> {
  const grouped = new Map<string, EngineRun[]>();
  for (const run of runs) {
    const existing = grouped.get(run.engine);
    if (existing) existing.push(run);
    else grouped.set(run.engine, [run]);
  }
  return grouped;
}

function allScores(runs: readonly EngineRun[]): FieldScore[] {
  return runs.flatMap((run) => run.scores);
}

export function renderReport(input: ReportInput): string {
  const { runs, skipped, fixtureNote } = input;
  const out: string[] = [];

  out.push('# W-2 extraction: Track A vs Track B');
  out.push('');

  if (runs.length === 0) {
    out.push('No engine produced a result. Nothing to compare yet.');
    out.push('');
    if (skipped.length > 0) out.push(...renderSkipped(skipped));
    return `${out.join('\n')}\n`;
  }

  const engines = groupByEngine(runs);

  out.push(...renderSummary(engines));
  out.push(...renderGallery(runs));
  out.push(...renderTiers(engines));
  out.push(...renderCalibration(engines));
  out.push(...renderMatrix(runs, engines));
  out.push(...renderOperational(engines));
  if (skipped.length > 0) out.push(...renderSkipped(skipped));
  out.push(...renderCaveats(fixtureNote, runs));

  return `${out.join('\n')}\n`;
}

function renderSummary(engines: Map<string, EngineRun[]>): string[] {
  const out = ['## Summary', ''];
  out.push(
    '| Engine | Score | Accuracy | **Over** | Under | Wrong | Halluc. | Missed | Abstained | p95 ms | $/doc |',
  );
  out.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');

  const rows = [...engines.entries()].map(([engine, runs]) => {
    const scores = allScores(runs);
    const totals = tally(scores);
    const latencies = runs.map((r) => r.result.latencyMs);
    const cost = runs.reduce((sum, r) => sum + r.result.costUsd, 0) / runs.length;
    return { engine, scores, totals, latencies, cost, score: composite(scores) };
  });

  rows.sort((a, b) => b.score - a.score);

  for (const row of rows) {
    out.push(
      `| ${row.engine} | ${row.score} | ${pct(accuracy(row.scores))} | ` +
        `**${row.totals.wrong_over}** | ${row.totals.wrong_under} | ${row.totals.wrong} | ` +
        `${row.totals.hallucinated} | ${row.totals.missed} | ${row.totals.correct_abstain} | ` +
        `${Math.round(percentile(row.latencies, 95))} | ${money(row.cost)} |`,
    );
  }

  out.push('');
  out.push(
    '`Over` is bold because it is the failure that harms people silently: overstating income ' +
      'hides programmes a household qualifies for, and nothing downstream ever reveals it. ' +
      '`Abstained` is reported but scores zero — see the note at the end.',
  );
  out.push('');
  return out;
}

/**
 * Every wrong and hallucinated field, with what was expected, what was read, and how sure the
 * engine was. Read this before trusting any aggregate above it.
 */
function renderGallery(runs: readonly EngineRun[]): string[] {
  const bad = runs.flatMap((run) =>
    run.scores
      .filter((s) => s.outcome === 'wrong' || s.outcome === 'wrong_over' || s.outcome === 'wrong_under' || s.outcome === 'hallucinated')
      .map((score) => ({ run, score })),
  );

  const out = ['## Failure gallery', ''];
  if (bad.length === 0) {
    out.push('No engine returned a wrong or invented value. Check the fixture count before celebrating.');
    out.push('');
    return out;
  }

  // Worst outcomes first, then the most confident mistakes -- a wrong answer the engine was sure
  // about is the one that reaches a user unreviewed.
  const rank: Record<string, number> = { wrong_over: 0, hallucinated: 1, wrong: 2, wrong_under: 3 };
  bad.sort(
    (a, b) =>
      (rank[a.score.outcome] ?? 9) - (rank[b.score.outcome] ?? 9) ||
      b.score.confidence - a.score.confidence,
  );

  out.push('| Engine | Fixture | Field | Tier | Outcome | Expected | Read | Conf |');
  out.push('|---|---|---|---|---|---|---|---:|');
  for (const { run, score } of bad.slice(0, 80)) {
    out.push(
      `| ${run.engine} | ${run.fixture} | \`${score.field}\` | ${score.tier} | ` +
        `${score.outcome} | \`${score.expected ?? '—'}\` | \`${score.actual ?? '—'}\` | ` +
        `${score.confidence.toFixed(2)} |`,
    );
  }
  if (bad.length > 80) out.push(`\n_${bad.length - 80} further failures not listed._`);
  out.push('');
  return out;
}

function renderTiers(engines: Map<string, EngineRun[]>): string[] {
  const out = ['## Accuracy by field tier', ''];
  out.push('| Engine | Critical | Important | Nice to have |');
  out.push('|---|---:|---:|---:|');

  for (const [engine, runs] of engines) {
    const scores = allScores(runs);
    const cell = (tier: Tier) => {
      const tierScores = byTier(scores, tier);
      const attempted = tierScores.filter((s) => s.outcome !== 'correct_abstain');
      return attempted.length === 0 ? '—' : `${pct(accuracy(tierScores))} (n=${attempted.length})`;
    };
    out.push(`| ${engine} | ${cell('critical')} | ${cell('important')} | ${cell('nice')} |`);
  }

  out.push('');
  out.push(
    'Critical is `box5_medicare_wages`, `box1_wages`, `box3_ss_wages`, `tax_year`. Box 5 decides ' +
      'which programmes a household is shown, so an engine that nails it and fumbles Box 14 is ' +
      'more useful than the reverse.',
  );
  out.push('');
  return out;
}

function renderCalibration(engines: Map<string, EngineRun[]>): string[] {
  const out = ['## Confidence calibration', ''];

  for (const [engine, runs] of engines) {
    out.push(`**${engine}**`, '');
    out.push('| Confidence | Fields | Actually correct |');
    out.push('|---|---:|---:|');
    for (const bucket of calibration(allScores(runs))) {
      out.push(`| ${bucket.label} | ${bucket.n} | ${bucket.n === 0 ? '—' : pct(bucket.accuracy)} |`);
    }
    out.push('');
  }

  out.push(
    '**These tables are not comparable across tracks.** Track A derives confidence from OCR word ' +
      'confidence and anchor-match quality; Track B derives it from format conformance and ' +
      'validator agreement. Neither is a probability, and putting them side by side would imply ' +
      'they measure the same thing. Read each engine against itself: a well-calibrated 85% is ' +
      'worth more in production than an uniformly-confident 92%, because only the first can tell ' +
      'a review screen what to highlight.',
  );
  out.push('');
  return out;
}

function renderMatrix(runs: readonly EngineRun[], engines: Map<string, EngineRun[]>): string[] {
  const fixtures = [...new Set(runs.map((r) => r.fixture))].sort();
  const names = [...engines.keys()];

  const out = ['## Per-fixture accuracy', ''];
  out.push(`| Fixture | ${names.join(' | ')} |`);
  out.push(`|---|${names.map(() => '---:').join('|')}|`);

  for (const fixture of fixtures) {
    const cells = names.map((engine) => {
      const run = runs.find((r) => r.fixture === fixture && r.engine === engine);
      return run ? pct(accuracy(run.scores)) : '—';
    });
    out.push(`| ${fixture} | ${cells.join(' | ')} |`);
  }

  out.push('');
  out.push('Layout- and capture-specific weakness shows up here and nowhere else in this report.');
  out.push('');
  return out;
}

function renderOperational(engines: Map<string, EngineRun[]>): string[] {
  const out = ['## Operational', ''];
  out.push('| Engine | Docs | p50 ms | p95 ms | $/doc | Warnings | From cache |');
  out.push('|---|---:|---:|---:|---:|---:|---:|');

  for (const [engine, runs] of engines) {
    const latencies = runs.map((r) => r.result.latencyMs);
    const warnings = runs.reduce((sum, r) => sum + r.result.warnings.length, 0);
    const cached = runs.filter((r) => r.fromCache).length;
    const cost = runs.reduce((sum, r) => sum + r.result.costUsd, 0) / runs.length;
    out.push(
      `| ${engine} | ${runs.length} | ${Math.round(percentile(latencies, 50))} | ` +
        `${Math.round(percentile(latencies, 95))} | ${money(cost)} | ${warnings} | ${cached} |`,
    );
  }

  out.push('');
  return out;
}

function renderSkipped(skipped: readonly { engine: string; reason: string }[]): string[] {
  const out = ['## Not run', ''];
  for (const item of skipped) out.push(`- **${item.engine}** — ${item.reason}`);
  out.push('');
  out.push(
    'Listed rather than omitted: a report that quietly drops an engine reads as though the ' +
      'comparison was complete.',
  );
  out.push('');
  return out;
}

function renderCaveats(fixtureNote: string, runs: readonly EngineRun[]): string[] {
  return [
    '## How to read this',
    '',
    fixtureNote,
    '',
    '**Scoring.** `correct` +1, `missed` −1, `wrong_under` −2, `wrong` −3, `hallucinated` −4, ' +
      '`wrong_over` −5. Correct abstention scores **0**, not +1 as originally specified: on a form ' +
      'this sparse, +1 per abstention makes an engine that returns nothing at all score positive, ' +
      'which would make the composite reward silence. It is still counted and reported.',
    '',
    '**The decision is not simply "higher score wins."**',
    '',
    '- If the two are within a few points, prefer the one whose OCR is self-hosted — the document ' +
      'reaching no third party is worth a real accuracy concession.',
    '- If Track B wins decisively on the adversarial fixtures specifically, the answer is probably ' +
      'a hybrid: deterministic parse first, VLM on low confidence. Note which fixtures drove it.',
    "- If Track A's LLM fallback rarely fires, the deterministic path can stand alone. That is the " +
      'best available outcome and worth saying plainly.',
    '- If both fail on the same fixtures, the problem is capture quality, not extraction. The fix ' +
      'is a better camera flow — edge detection, glare warnings, retake prompts — not a better model.',
    '',
    `_${runs.length} runs scored._`,
    '',
  ];
}
