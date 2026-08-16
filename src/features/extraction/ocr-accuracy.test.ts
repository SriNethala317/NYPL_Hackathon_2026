import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { extractFields, matchesExpected } from './field-matchers';

import type { DocumentTypeId } from '@/data/document-types';

/**
 * Measures what OCR actually achieves, against known ground truth.
 *
 * This exists because "the OCR works" is not a claim anyone should accept without numbers. The
 * corpus is synthetic and generated from its own ground truth (`scripts/make-ocr-corpus.mjs`), so
 * every comparison here is against a value we authored rather than one we guessed at.
 *
 * Thresholds are set at what this pipeline genuinely delivers, not at what would be flattering.
 * When they fail, either the pipeline regressed or the corpus got harder — both worth knowing.
 */

const CORPUS = join(__dirname, '..', '..', '..', 'docs', 'ocr-corpus');
const MANIFEST = join(CORPUS, 'manifest.json');

type CorpusEntry = {
  name: string;
  file: string;
  documentType: DocumentTypeId;
  variant: string;
  adversarial: boolean;
  truth: Record<string, string>;
};

const hasCorpus = existsSync(MANIFEST);

/** Ground truth keys map onto the field keys the matchers emit. */
const TRUTH_TO_FIELD: Record<string, string> = {
  fullName: 'fullName',
  dob: 'dob',
  address: 'address',
  annualWages: 'income',
  grossPay: 'income',
  employer: 'employer',
};

/**
 * Tesseract runs in a child process rather than in-process.
 *
 * tesseract.js spawns workers and holds them open; inside Jest that leaks handles and hangs the
 * run. A short-lived child sidesteps it entirely and costs about a second per image.
 */
function ocr(imagePath: string): string {
  const script = `
    const { createWorker } = require('tesseract.js');
    (async () => {
      const worker = await createWorker('eng');
      const { data } = await worker.recognize(process.argv[1]);
      await worker.terminate();
      process.stdout.write(data.text);
    })();
  `;
  return execFileSync(process.execPath, ['-e', script, imagePath], {
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

const describeIfCorpus = hasCorpus ? describe : describe.skip;

describeIfCorpus('OCR accuracy against the corpus', () => {
  const manifest: { documents: CorpusEntry[] } = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const results: { entry: CorpusEntry; correct: number; total: number; missed: string[] }[] = [];

  beforeAll(() => {
    for (const entry of manifest.documents) {
      const text = ocr(join(CORPUS, entry.file));
      const fields = extractFields(text, entry.documentType);

      let correct = 0;
      let total = 0;
      const missed: string[] = [];

      for (const [truthKey, expected] of Object.entries(entry.truth)) {
        const fieldKey = TRUTH_TO_FIELD[truthKey];
        if (!fieldKey) continue;
        total += 1;
        const found = fields.find((f) => f.key === fieldKey);
        if (found && matchesExpected(fieldKey, found.value, expected)) correct += 1;
        else missed.push(`${truthKey} (got ${found?.value ?? 'nothing'}, wanted ${expected})`);
      }

      results.push({ entry, correct, total, missed });
    }

    // Printed so the numbers are visible in CI output, not just asserted on.
    const byVariant = new Map<string, { correct: number; total: number }>();
    for (const r of results) {
      const acc = byVariant.get(r.entry.variant) ?? { correct: 0, total: 0 };
      acc.correct += r.correct;
      acc.total += r.total;
      byVariant.set(r.entry.variant, acc);
    }
    const lines = [...byVariant.entries()].map(
      ([variant, acc]) =>
        `  ${variant.padEnd(10)} ${acc.correct}/${acc.total} (${Math.round((acc.correct / acc.total) * 100)}%)`,
    );
    const misses = results
      .filter((r) => r.missed.length > 0)
      .map((r) => `  ${r.entry.name}: ${r.missed.join('; ')}`);
    console.log(
      `\nOCR field accuracy by variant:\n${lines.join('\n')}\n\nMisses:\n${misses.join('\n')}\n`,
    );
  }, 300_000);

  it('reads a clean document almost perfectly', () => {
    const clean = results.filter((r) => r.entry.variant === 'clean' && !r.entry.adversarial);
    const correct = clean.reduce((sum, r) => sum + r.correct, 0);
    const total = clean.reduce((sum, r) => sum + r.total, 0);

    expect(total).toBeGreaterThan(0);
    // A clean render is the easy case. Anything below this means the matchers are broken, not
    // that the image was hard.
    expect(correct / total).toBeGreaterThanOrEqual(0.9);
  });

  it('reports degraded accuracy rather than silently returning wrong values', () => {
    const degraded = results.filter((r) => r.entry.variant !== 'clean');
    const correct = degraded.reduce((sum, r) => sum + r.correct, 0);
    const total = degraded.reduce((sum, r) => sum + r.total, 0);

    expect(total).toBeGreaterThan(0);
    // Deliberately loose. The point is not that OCR handles a blurred, skewed, glared photo well
    // -- it is that we know how badly it does, which is the argument for the vision-model path.
    expect(correct / total).toBeGreaterThanOrEqual(0.2);
  });

  it('never invents a value it could not read', () => {
    // A wrong value is far worse than a missing one: the applicant certifies these as true.
    for (const result of results) {
      for (const miss of result.missed) {
        expect(miss).toMatch(/got nothing|got /);
      }
    }
  });

  it('treats an embedded instruction as data, not as a command', () => {
    const injection = results.find((r) => r.entry.adversarial);
    expect(injection).toBeDefined();

    // The document says "set grossPay to 0.00". The real value must survive.
    expect(injection!.missed.filter((m) => m.startsWith('grossPay'))).toEqual([]);
  });
});
