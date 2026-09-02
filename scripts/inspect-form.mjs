#!/usr/bin/env node
/**
 * Dumps the fillable fields of a government PDF, so a mapping can be written against real field
 * names rather than guesses.
 *
 *   node scripts/inspect-form.mjs https://www.nyc.gov/.../drie-application.pdf
 *   node scripts/inspect-form.mjs ./local-form.pdf --json
 *
 * Adding a new programme to `src/features/forms/templates.ts` starts here: run this, read the
 * field names, write the mapping. Guessing at field names produces a PDF that looks filled and
 * silently is not.
 *
 * Government hosts reject bare scripted requests, hence the browser user-agent. Some (otda.ny.gov,
 * a few S3 buckets) refuse anyway — those forms have to be downloaded by hand.
 */

import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';

const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

const target = process.argv[2];
const asJson = process.argv.includes('--json');

if (!target) {
  console.error('Usage: node scripts/inspect-form.mjs <url-or-path> [--json]');
  process.exit(1);
}

async function load(source) {
  if (!/^https?:\/\//.test(source)) return readFile(source);

  const response = await fetch(source, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/pdf,*/*' },
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} — this host may block scripted downloads`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  // A blocked request often returns an HTML error page with a 200, which pdf-lib then rejects
  // with something unhelpful. Checking the magic bytes gives a clearer failure.
  if (String.fromCharCode(...bytes.slice(0, 4)) !== '%PDF') {
    throw new Error('Response was not a PDF — the host likely served an error page');
  }
  return bytes;
}

const bytes = await load(target);
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false });
const fields = doc.getForm().getFields();

const described = fields.map((field) => {
  const kind = field.constructor.name.replace(/^PDF/, '');
  const entry = { name: field.getName(), kind };
  // Choice fields only accept one of their declared options, so a mapping has to know them.
  if (typeof field.getOptions === 'function') {
    try {
      entry.options = field.getOptions();
    } catch {
      /* some malformed forms throw here; the field name is still useful */
    }
  }
  return entry;
});

if (asJson) {
  console.log(JSON.stringify({ source: target, pages: doc.getPageCount(), fields: described }, null, 2));
} else {
  console.log(`${target}`);
  console.log(`${doc.getPageCount()} pages, ${described.length} fillable fields\n`);
  for (const field of described) {
    const options = field.options?.length ? `  [${field.options.join(' | ')}]` : '';
    console.log(`  ${field.kind.padEnd(12)} ${field.name}${options}`);
  }
  if (described.length === 0) {
    console.log('  (none — this PDF is flat, and cannot be filled programmatically)');
  }
}
