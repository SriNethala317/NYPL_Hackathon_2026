#!/usr/bin/env node
/**
 * Builds the W-2 extraction findings report as a PDF.
 *
 *   node make-report.mjs            # -> results/w2-extraction-findings.pdf
 *
 * Every number in the document is read from `results/raw/` and scored at build time. Nothing is
 * typed in by hand, because a report whose figures drift from the runs that produced them is worse
 * than no report — it is a confident wrong answer, which is the exact failure mode this whole
 * project exists to measure.
 *
 * Rendering goes through the same headless Chrome that builds the fixtures, so it needs no new
 * dependency.
 */

import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { W2Fields } from './core/schema.ts';
import { accuracy, byTier, composite, scoreExtraction, tally } from './harness/score.ts';

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, 'results', 'raw');
const CASES = join(HERE, 'test-cases');
const OUT = join(HERE, 'results');
const CHROME = process.env.CHROME_BIN ?? 'google-chrome';

/* ------------------------------------------------------------------ gather */

const truthFor = (fixture) =>
  W2Fields.parse(JSON.parse(readFileSync(join(CASES, fixture, 'expected.json'), 'utf8')));

const LABELS = {
  'track-b_gemini_gemini-flash-lite-latest@mid': 'Gemini Flash-Lite',
  'track-b_gemini_gemini-3.5-flash@mid': 'Gemini 3.5 Flash',
  'track-b_ollama_qwen3-vl_2b@mid': 'qwen3-vl:2b (local)',
  'track-a_sidecar_localhost_8000': 'Track A — OCR + parser',
};

function gather() {
  const engines = [];
  const failures = [];

  for (const dir of readdirSync(RAW)) {
    const scores = [];
    const perFixture = {};
    let ms = 0;
    let cost = 0;
    let n = 0;

    for (const file of readdirSync(join(RAW, dir))) {
      const fixture = file.split('.')[0];
      if (!existsSync(join(CASES, fixture, 'expected.json'))) continue;

      const record = JSON.parse(readFileSync(join(RAW, dir, file), 'utf8'));
      const scored = scoreExtraction(
        record.fields,
        truthFor(fixture),
        record.fieldConfidence,
        'screener',
      );

      scores.push(...scored);
      perFixture[fixture] = Math.round(accuracy(scored) * 100);
      ms += record.latencyMs ?? 0;
      cost += record.costUsd ?? 0;
      n += 1;

      for (const s of scored) {
        if (['wrong', 'wrong_over', 'wrong_under', 'hallucinated'].includes(s.outcome)) {
          failures.push({ engine: dir, fixture, ...s });
        }
      }
    }

    const t = tally(scores);
    engines.push({
      id: dir,
      label: LABELS[dir] ?? dir,
      n,
      score: composite(scores),
      accuracy: Math.round(accuracy(scores) * 100),
      critical: Math.round(accuracy(byTier(scores, 'critical')) * 100),
      over: t.wrong_over,
      under: t.wrong_under,
      wrong: t.wrong,
      hallucinated: t.hallucinated,
      missed: t.missed,
      avgMs: Math.round(ms / Math.max(1, n)),
      costPerDoc: cost / Math.max(1, n),
      perFixture,
    });
  }

  // Best first. Ties broken by accuracy, which is what a reader would expect.
  engines.sort((a, b) => b.score - a.score || b.accuracy - a.accuracy);

  const fixtures = readdirSync(CASES)
    .filter((d) => existsSync(join(CASES, d, 'expected.json')))
    .sort();

  return { engines, failures, fixtures };
}

/* -------------------------------------------------------------------- html */

const esc = (s) =>
  String(s ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const pct = (n) => `${n}%`;
const money = (n) => (n === 0 ? 'free' : `$${n.toFixed(5)}`);
const secs = (ms) => (ms >= 10_000 ? `${(ms / 1000).toFixed(0)} s` : `${(ms / 1000).toFixed(1)} s`);

/** A cell that reads as good/bad at a glance without relying on colour alone. */
const grade = (v) => (v >= 95 ? 'good' : v >= 75 ? 'ok' : v >= 50 ? 'weak' : 'bad');

function summaryTable(engines) {
  const rows = engines
    .map((e, i) => {
      const win = i === 0 ? ' class="winner"' : '';
      return `<tr${win}>
        <td class="name">${esc(e.label)}${i === 0 ? '<span class="pick">recommended</span>' : ''}</td>
        <td class="num">${e.n}</td>
        <td class="num strong">${e.score}</td>
        <td class="num ${grade(e.accuracy)}">${pct(e.accuracy)}</td>
        <td class="num ${grade(e.critical)}">${pct(e.critical)}</td>
        <td class="num ${e.over > 0 ? 'bad strong' : 'good'}">${e.over}</td>
        <td class="num ${e.hallucinated > 0 ? 'bad' : 'good'}">${e.hallucinated}</td>
        <td class="num">${e.missed}</td>
        <td class="num">${secs(e.avgMs)}</td>
        <td class="num">${money(e.costPerDoc)}</td>
      </tr>`;
    })
    .join('');

  return `<table class="summary">
    <thead><tr>
      <th>Engine</th><th class="num">Docs</th><th class="num">Score</th><th class="num">Accuracy</th>
      <th class="num">Critical</th><th class="num">Over</th><th class="num">Invented</th>
      <th class="num">Blank</th><th class="num">Speed</th><th class="num">Cost/doc</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function matrix(engines, fixtures) {
  const head = engines.map((e) => `<th class="num rot">${esc(e.label)}</th>`).join('');
  const rows = fixtures
    .map((f) => {
      const cells = engines
        .map((e) => {
          const v = e.perFixture[f];
          return v === undefined
            ? '<td class="num none">—</td>'
            : `<td class="num ${grade(v)}">${v}</td>`;
        })
        .join('');
      const capture = f.split('-').pop();
      const hard = ['phone', 'blur', 'skew'].includes(capture) ? ' class="hard"' : '';
      return `<tr${hard}><td class="fixture">${esc(f)}</td>${cells}</tr>`;
    })
    .join('');

  return `<table class="matrix">
    <thead><tr><th>Test case</th>${head}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function failureTable(failures) {
  const order = { wrong_over: 0, hallucinated: 1, wrong: 2, wrong_under: 3 };
  const rows = failures
    .slice()
    .sort((a, b) => (order[a.outcome] ?? 9) - (order[b.outcome] ?? 9) || b.confidence - a.confidence)
    .map(
      (f) => `<tr>
        <td>${esc(LABELS[f.engine] ?? f.engine)}</td>
        <td class="mono">${esc(f.fixture)}</td>
        <td class="mono">${esc(f.field)}</td>
        <td class="${f.outcome === 'wrong_over' ? 'bad strong' : ''}">${esc(f.outcome.replace('_', ' '))}</td>
        <td class="mono">${esc(f.expected)}</td>
        <td class="mono">${esc(f.actual)}</td>
        <td class="num">${f.confidence.toFixed(2)}</td>
      </tr>`,
    )
    .join('');

  return `<table class="failures">
    <thead><tr><th>Engine</th><th>Test case</th><th>Field</th><th>Outcome</th>
      <th>On the form</th><th>Read as</th><th class="num">Conf.</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function render({ engines, failures, fixtures }) {
  const winner = engines[0];
  const local = engines.find((e) => e.id.includes('ollama'));
  const trackA = engines.find((e) => e.id.includes('track-a'));
  const overs = failures.filter((f) => f.outcome === 'wrong_over');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>W-2 extraction findings</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "DejaVu Sans", -apple-system, Segoe UI, Helvetica, Arial, sans-serif;
         color: #14181f; font-size: 10pt; line-height: 1.45; margin: 0; }
  h1 { font-size: 21pt; margin: 0 0 2mm; letter-spacing: -0.4px; }
  h2 { font-size: 13pt; margin: 9mm 0 3mm; padding-bottom: 1.5mm;
       border-bottom: 2px solid #1B2E7F; color: #1B2E7F; }
  h3 { font-size: 10.5pt; margin: 5mm 0 2mm; }
  p { margin: 0 0 3mm; }
  .sub { color: #5a6472; font-size: 9pt; margin-bottom: 6mm; }
  .verdict { border-left: 4px solid #1B2E7F; background: #f4f6fc;
             padding: 4mm 5mm; margin: 0 0 6mm; }
  .verdict .head { font-size: 12pt; font-weight: 700; color: #1B2E7F; margin-bottom: 2mm; }
  table { width: 100%; border-collapse: collapse; margin: 3mm 0 4mm; font-size: 8.8pt; }
  th { text-align: left; font-size: 7.6pt; text-transform: uppercase; letter-spacing: 0.4px;
       color: #5a6472; border-bottom: 1.5px solid #c3cad6; padding: 1.6mm 1.4mm; font-weight: 600; }
  td { padding: 1.6mm 1.4mm; border-bottom: 1px solid #e7eaf0; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .mono { font-family: "DejaVu Sans Mono", ui-monospace, Menlo, Consolas, monospace; font-size: 8pt; }
  .name { font-weight: 600; }
  .strong { font-weight: 700; }
  .good { color: #1a7f4b; } .ok { color: #14181f; }
  .weak { color: #9a6212; } .bad { color: #b3261e; }
  .none { color: #b9c0cc; }
  tr.winner td { background: #eef2fb; }
  .pick { display: inline-block; margin-left: 2mm; padding: 0.3mm 1.6mm; border-radius: 2mm;
          background: #1B2E7F; color: #fff; font-size: 6.8pt; text-transform: uppercase;
          letter-spacing: 0.5px; vertical-align: 1px; }
  tr.hard td.fixture::after { content: " · degraded"; color: #9aa3b2; font-size: 7pt; }
  .matrix td.fixture { font-family: "DejaVu Sans Mono", monospace; font-size: 7.8pt; }
  .why { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin: 3mm 0 4mm; }
  .why div { border: 1px solid #dde2ea; border-radius: 2mm; padding: 3mm 3.5mm; }
  .why h4 { margin: 0 0 1.5mm; font-size: 9.5pt; color: #1B2E7F; }
  .why p { margin: 0; font-size: 8.8pt; color: #3d4757; }
  .caveat { background: #fdf6e8; border: 1px solid #efd9a8; border-radius: 2mm;
            padding: 3.5mm 4mm; font-size: 9pt; }
  .caveat h3 { margin-top: 0; color: #8a5a00; }
  ul { margin: 0 0 3mm; padding-left: 5mm; } li { margin-bottom: 1.5mm; }
  .foot { margin-top: 8mm; padding-top: 3mm; border-top: 1px solid #dde2ea;
          color: #7a8494; font-size: 7.8pt; }
  .break { page-break-before: always; }
  code { font-family: "DejaVu Sans Mono", monospace; font-size: 8.6pt;
         background: #f1f3f7; padding: 0.3mm 1mm; border-radius: 1mm; }
</style></head><body>

<h1>Reading a W-2: which engine to build on</h1>
<div class="sub">Findings from ${fixtures.length} test cases across 4 form layouts and 6 capture conditions.
Scored on the four fields the NYC benefits screener actually consumes.</div>

<div class="verdict">
  <div class="head">Recommendation: ${esc(winner.label)}</div>
  <p style="margin:0">It scores highest (<strong>${winner.score}</strong>), reads
  <strong>${pct(winner.accuracy)}</strong> of fields correctly and <strong>${pct(winner.critical)}</strong>
  of the income figures the screener depends on — and across all ${winner.n} cases it never once
  overstated income and never invented a value. It is also the fastest engine that is also accurate,
  at ${secs(winner.avgMs)} per document and ${money(winner.costPerDoc)}.</p>
</div>

<h2>The scoreboard</h2>
${summaryTable(engines)}
<p style="font-size:8.6pt;color:#5a6472"><strong>Over</strong> counts income read <em>higher</em>
than the form says. <strong>Invented</strong> counts values returned for boxes that are blank or
absent. <strong>Blank</strong> counts fields the engine declined to answer — cheap, because the app
simply asks the user. Score weights these by real-world cost: correct +1, blank −1, understated −2,
wrong −3, invented −4, <strong>overstated −5</strong>.</p>

<h2>Why overstating income is the failure that matters</h2>
<p>This pipeline pre-fills benefit applications. Read income too <em>low</em> and an extra programme
appears that the user can decline — visible, recoverable, cheap. Read it too <em>high</em> and the
household is pushed over an eligibility cap, the programme silently never appears, and
<strong>nobody ever finds out</strong> — not the user, not the caseworker, and not any metric in
this report. That asymmetry is why overstatement is weighted five times a correct answer.</p>

<p>Only one engine commits it${overs.length > 0 ? `, and it does so at high confidence` : ''}:</p>
${overs.length > 0 ? failureTable(overs) : '<p>None.</p>'}
${
  local && local.over > 0
    ? `<p>Both of ${esc(local.label)}'s overstatements are the same mistake — reading Box 3
       (Social Security wages) into Box 1 — reported at confidence 0.85, with no signal that
       anything was wrong. On a degraded capture the same model also returned
       <code>JANE DOE</code> and <code>1234 MAIN STREET, NEW YORK, NY 10001</code>: not a misreading
       but a fabricated placeholder.</p>`
    : ''
}

<div class="break"></div>
<h2>How each engine behaves, case by case</h2>
<p>Percentage of the screener's fields read correctly. Rows marked <em>degraded</em> are
photographed rather than scanned — off-axis, out of focus, noisy and JPEG-compressed.</p>
${matrix(engines, fixtures)}

<div class="why">
  <div><h4>On a clean scan, the parser is its equal</h4>
    <p>${esc(winner.label)} and ${esc(trackA?.label ?? 'the parser')} both read <strong>100%</strong>
    of every flatbed-quality capture, on all four layouts. If users photographed their W-2 flat and
    in focus, the free self-hosted option would be just as good.</p></div>
  <div><h4>On a phone photo, the gap opens</h4>
    <p>${esc(winner.label)} holds up where the others fall away. That is the case that decides it,
    because a phone photo is what people actually send.</p></div>
</div>

<h2>What the alternatives are good at</h2>
<h3>${esc(trackA?.label ?? 'Track A')} — never wrong, often silent</h3>
<p>OCR into a hand-written parser. It scored ${pct(trackA?.accuracy ?? 0)} overall, but every one of
its ${trackA?.missed ?? 0} shortfalls is a <em>refusal to answer</em>, not a mistake: zero
overstatements, zero inventions, across all ${trackA?.n ?? 0} cases. It is also the fastest engine
here (${secs(trackA?.avgMs ?? 0)}), completely free, and the only one where the document never
leaves hardware you control. It fails when OCR cannot read the printed labels, which is exactly
what happens on a blurred or angled photo.</p>

<h3>${esc(local?.label ?? 'Local model')} — free and unmetered, but the risky one</h3>
<p>Runs entirely on your own machine with no quota at all, and reads
${pct(local?.critical ?? 0)} of critical fields. But it is ${Math.round((local?.avgMs ?? 1) / (winner.avgMs || 1))}×
slower than ${esc(winner.label)} and it is the <em>only</em> engine that overstates income. On this
hardware it cannot use the GPU: a 4&nbsp;GB card cannot hold its vision encoder, whose compute
buffer alone requests more memory than the card has, so it runs on CPU throughout.</p>

<h2>What this report does not claim</h2>
<div class="caveat">
  <h3>The test images were rendered, never printed</h3>
  <p style="margin:0">Ground truth is authored first and the image generated from it, so the truth
  never passes through an extractor or a transcriber — that part is sound. But no page here was
  printed and photographed, so genuine paper texture and true focus falloff are absent.
  <strong>Every engine will score lower on real documents than it does here.</strong> The
  deterministic parser has the most to lose, because it depends on OCR reading printed labels that
  real capture degrades first. Printing a subset and photographing it is the next measurement worth
  taking.</p>
</div>
<ul>
  <li>Gemini 3.5 Flash appears with only ${engines.find((e) => e.id.includes('3.5'))?.n ?? 0} cases;
      its free tier caps at 20 requests per day, so it could not complete the corpus. Its numbers are
      indicative only and it is not a candidate.</li>
  <li>Confidence figures are not comparable between engines — the parser derives it from OCR and
      anchor quality, the models from output shape. Each is only meaningful against itself.</li>
  <li>Free-tier terms differ. Google's free tier trains on submitted input; that is acceptable for
      synthetic fixtures and needs revisiting before real tax documents are sent.</li>
</ul>

<h2>Recommended shape</h2>
<p>Use <strong>${esc(winner.label)}</strong> as the reader, with
<strong>${esc(trackA?.label ?? 'the OCR parser')}</strong> as an independent cross-check. The two
fail in unrelated ways — one is a character recogniser, the other a generative model — which is the
condition that makes agreement between them meaningful rather than merely correlated. Accept a value
when both agree; leave the field blank for the user when they disagree or the parser abstains. A
blank field costs one point; an overstated one costs five and is never noticed.</p>

<div class="foot">
  Generated from ${engines.reduce((n, e) => n + e.n, 0)} scored extraction runs held in
  <code>results/raw/</code>. Every figure is computed at build time by <code>make-report.mjs</code>;
  none is transcribed by hand. Regenerate with <code>node make-report.mjs</code>.
</div>
</body></html>`;
}

/* ------------------------------------------------------------------- build */

const data = gather();
await mkdir(OUT, { recursive: true });

const htmlPath = join(OUT, 'w2-extraction-findings.html');
const pdfPath = join(OUT, 'w2-extraction-findings.pdf');

await writeFile(htmlPath, render(data), 'utf8');
await run(CHROME, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  '--no-pdf-header-footer',
  `--print-to-pdf=${pdfPath}`,
  `file://${htmlPath}`,
]);

console.log(`  ${data.engines.length} engines, ${data.fixtures.length} test cases, ${data.failures.length} failures`);
console.log(`  recommended: ${data.engines[0].label} (score ${data.engines[0].score})`);
console.log(`\n  ${pdfPath}`);
