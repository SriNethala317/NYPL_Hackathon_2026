import type { ExtractionResult, Extractor } from '../../core/extractor.ts';
import { emptyFields, W2Fields } from '../../core/schema.ts';
import { validate } from '../../core/validate.ts';
import { createSidecar } from './ocr/sidecar.ts';
import type { OcrProvider } from './ocr/types.ts';
import { parse } from './parser.ts';

/**
 * Track A: OCR into a deterministic parser.
 *
 * The half of the bake-off that was missing. Everything measured before this compared two vision
 * models against each other and called it a track comparison, which it was not.
 *
 * ## The shape of the argument
 *
 * This track cannot invent a value. A model asked for Box 5 on a page without one will usually
 * produce a plausible number — measured here, `qwen3-vl` wrote `0.00` into 59 absent boxes and
 * invented 53 box-12 rows, at a reported confidence of 0.85. An anchor that finds no label returns
 * nothing, always, and says which of the two reasons applied.
 *
 * It also never sends the document anywhere but a service you run, which is the only privacy story
 * available now that Expo Go rules out on-device OCR entirely.
 *
 * What it gives up is tolerance for layouts nobody anticipated. A vision model reads a form it has
 * never seen; this reads forms whose labels somebody wrote down. The corpus has four layouts
 * precisely to measure how much that costs.
 */

function createExtractor(ocr: OcrProvider): Extractor {
  const name = `track-a:${ocr.name}`;

  return {
    name,

    async extract(imagePath: string): Promise<ExtractionResult> {
      const started = Date.now();

      if (!(await ocr.isAvailable())) {
        return failed(name, started, [ocr.unavailableReason()]);
      }

      let page;
      try {
        page = await ocr.read(imagePath);
      } catch (error) {
        return failed(name, started, [`OCR failed: ${String(error)}`]);
      }

      const parsed = parse(page);
      const warnings: string[] = [];

      const fields: Record<string, unknown> = { ...emptyFields() };
      const confidence: Record<string, number> = {};

      for (const field of parsed.fields) {
        fields[field.field] = field.value;
        confidence[field.field] = field.confidence;
      }

      /*
       * Two kinds of not-found, kept apart.
       *
       * A label that never appeared means the field is not on this page — a 4-up sheet has no box
       * 14, and returning null for it is correct. A label found with nothing beside it means the
       * value is there and could not be read, which is a different thing and the one worth showing
       * a person. Collapsing them is exactly what makes a hallucinated 0.00 indistinguishable from
       * a genuine blank.
       */
      if (parsed.unmatched.length > 0) {
        warnings.push(`No label found for: ${parsed.unmatched.join(', ')}.`);
      }
      if (parsed.unreadable.length > 0) {
        warnings.push(`Label found but value unreadable: ${parsed.unreadable.join(', ')}.`);
      }

      // `as_of` is derived, not read: the schema wants it and the page never prints it.
      const year = fields.tax_year;
      if (typeof year === 'string' && year !== '') fields.as_of = `${year}-12-31`;

      const result = W2Fields.safeParse(fields);
      if (!result.success) {
        return failed(name, started, [...warnings, `Parsed fields did not validate: ${result.error.message}`]);
      }

      for (const warning of validate(result.data)) {
        warnings.push(`${warning.code}: ${warning.message}`);
      }

      return {
        fields: result.data,
        fieldConfidence: confidence,
        latencyMs: Date.now() - started,
        // Self-hosted: the electricity is real and the invoice is not.
        costUsd: 0,
        engine: name,
        raw: {
          ocrEngine: page.engine,
          lines: page.lines.length,
          ink: page.ink,
          ocrMs: page.latencyMs,
          unmatched: parsed.unmatched,
          unreadable: parsed.unreadable,
        },
        warnings,
        unreadable: parsed.unreadable,
      };
    },
  };
}

/** All-nulls plus an explanation, flagged so the cache refuses to remember it. */
function failed(engine: string, started: number, warnings: string[]): ExtractionResult {
  return {
    fields: emptyFields(),
    fieldConfidence: {},
    latencyMs: Date.now() - started,
    costUsd: 0,
    engine,
    raw: null,
    warnings,
    failed: true,
  };
}

export function createExtractors(_options: { ocr?: string }): Extractor[] {
  return [createExtractor(createSidecar())];
}
