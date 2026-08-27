import type { ExtractionResult, Extractor } from '../../core/extractor.ts';
import { emptyFields } from '../../core/schema.ts';
import { validate } from '../../core/validate.ts';
import { applySelfConsistency, deriveConfidence } from './confidence.ts';
import { prepare, type Resolution } from './preprocess.ts';
import { buildPrompt, repairPrompt } from './prompt.ts';
import { createGemini } from './providers/gemini.ts';
import { createGroqVision } from './providers/groq-vision.ts';
import { createOllama } from './providers/ollama.ts';
import type { VlmProvider } from './providers/types.ts';
import { repair } from './repair.ts';

/**
 * Track B: a vision model reads the image directly.
 *
 * Deliberately shorter than Track A — image in, JSON out, repair, validate. There is no OCR stage
 * and there must not be one: feeding OCR text to a vision model would be a third architecture, not
 * this one, and the comparison only means something if each track is the thing it claims to be.
 *
 * ## The structural disadvantage, stated plainly
 *
 * Two of three providers require the image to leave the device. Only the local one does not, and it
 * is the slowest and least accurate of the three. If this track wins, the production app uploads
 * photographs of tax documents to a third party — that is a real cost, not merely a technical one,
 * and it belongs in the final decision even if this track scores higher.
 */

function createExtractor(provider: VlmProvider, resolution: Resolution, selfConsistency: boolean): Extractor {
  const name = `track-b:${provider.name}@${resolution}${selfConsistency ? '+sc' : ''}`;
  let warmed = false;

  return {
    name,

    async extract(imagePath: string): Promise<ExtractionResult> {
      const started = Date.now();
      const warnings: string[] = [];

      if (!provider.isAvailable()) {
        return failed(name, started, [provider.unavailableReason()]);
      }

      if (!warmed && provider.warmup) {
        warmed = true;
        await provider.warmup();
      }

      const image = await prepare(imagePath, resolution);
      const prompt = buildPrompt();

      let call;
      try {
        call = await provider.extract(image.base64, prompt);
      } catch (error) {
        // A provider that fails is a result, not an exception. The contract requires a valid
        // ExtractionResult even on total failure, because one dead engine must not lose the run.
        return failed(name, started, [`Provider failed: ${String(error)}`]);
      }

      let parsed = repair(call.text);

      /*
       * One retry, with the parser's own error appended.
       *
       * "Unexpected token < in JSON" tells the model it emitted a fence; a generic "that was
       * invalid" tells it nothing. The retry rate per provider is reported, because a model that
       * needs a second call on most documents costs twice what its headline latency suggests.
       */
      if (!parsed.ok) {
        warnings.push(`First response did not parse: ${parsed.error}. Retrying once.`);
        try {
          const retry = await provider.extract(image.base64, repairPrompt(parsed.error));
          call = { ...retry, latencyMs: call.latencyMs + retry.latencyMs, costUsd: call.costUsd + retry.costUsd };
          parsed = repair(retry.text);
        } catch (error) {
          return failed(name, started, [...warnings, `Retry also failed: ${String(error)}`]);
        }
      }

      if (!parsed.ok) {
        return failed(name, started, [...warnings, `Retry did not parse either: ${parsed.error}`]);
      }

      warnings.push(...parsed.warnings);

      let confidence = deriveConfidence(parsed.fields);

      if (selfConsistency) {
        try {
          const second = await provider.extract(image.base64, prompt);
          const secondParsed = repair(second.text);
          if (secondParsed.ok) {
            const applied = applySelfConsistency(confidence, parsed.fields, secondParsed.fields);
            confidence = applied.confidence;
            call = { ...call, latencyMs: call.latencyMs + second.latencyMs, costUsd: call.costUsd + second.costUsd };
            if (applied.disagreements.length > 0) {
              warnings.push(`Two runs disagreed on: ${applied.disagreements.join(', ')}.`);
            }
          } else {
            warnings.push('Self-consistency second run did not parse; confidence left unadjusted.');
          }
        } catch (error) {
          warnings.push(`Self-consistency second run failed: ${String(error)}`);
        }
      }

      for (const warning of validate(parsed.fields)) {
        warnings.push(`${warning.code}: ${warning.message}`);
      }

      const rateLimits = (call.raw as { rateLimits?: string[] })?.rateLimits;
      if (rateLimits?.length) warnings.push(`Rate limited: ${rateLimits.join('; ')}`);

      return {
        fields: parsed.fields,
        fieldConfidence: confidence,
        latencyMs: call.latencyMs,
        costUsd: call.costUsd,
        engine: name,
        raw: {
          provider: provider.name,
          resolution,
          imageBytes: image.bytes,
          longEdge: image.longEdge,
          promptTokens: call.promptTokens,
          completionTokens: call.completionTokens,
          response: call.raw,
        },
        warnings,
      };
    },
  };
}

/**
 * All-nulls plus an explanation. Never throws; the runner needs a result either way.
 *
 * `failed: true` is what keeps this out of the cache. Without it a quota error becomes a permanent
 * zero for that fixture — see `harness/cache.ts`.
 */
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

type Options = {
  vlm?: string;
  resolutions?: string[];
  selfConsistency?: boolean;
};

/**
 * Builds the engine list the runner will use.
 *
 * Gemini sweeps all three resolutions because it is cheap and fast enough that the sweep is the
 * point — resolution versus accuracy versus token cost is one of the more useful findings this
 * track can produce.
 *
 * Ollama is pinned to `mid` unless resolutions are named explicitly. At ~8.8 output tokens/sec on
 * the measured hardware, a three-resolution sweep across 13 fixtures is roughly an hour, and the
 * result is already legible from one pass. Restricting it is reported in the run output rather
 * than done silently — a quiet sample reads as full coverage.
 */
export function createExtractors(options: Options): Extractor[] {
  const requested = options.vlm ?? 'gemini';
  const selected = requested.split(',').map((s) => s.trim()).filter(Boolean);
  const selfConsistency = options.selfConsistency === true;

  const chosen = options.resolutions?.filter((r): r is Resolution =>
    r === 'low' || r === 'mid' || r === 'high',
  );

  const extractors: Extractor[] = [];

  for (const which of selected) {
    if (which === 'gemini') {
      const resolutions = chosen ?? (['low', 'mid', 'high'] as Resolution[]);
      for (const resolution of resolutions) {
        extractors.push(createExtractor(createGemini(), resolution, selfConsistency));
      }
      continue;
    }

    if (which === 'groq') {
      const resolutions = chosen ?? (['mid'] as Resolution[]);
      for (const resolution of resolutions) {
        extractors.push(createExtractor(createGroqVision(), resolution, selfConsistency));
      }
      continue;
    }

    /*
     * `ollama` runs the default model; `ollama:<model>` runs a named one, e.g. `ollama:qwen3-vl:2b`.
     *
     * The colon-splitting is fiddly because ollama's own model names contain colons — `gemma3:4b`
     * is one name, not a provider and a tag. Everything after the first colon is the model.
     */
    if (which === 'ollama' || which.startsWith('ollama:')) {
      const model = which.startsWith('ollama:') ? which.slice('ollama:'.length) : undefined;
      const resolutions = chosen ?? (['mid'] as Resolution[]);
      if (!chosen) {
        console.log(
          '  note: ollama pinned to --resolution mid (~90s/doc for a 4B model on a 4GB GPU). ' +
            'Pass --resolution low,mid,high to sweep anyway.',
        );
      }
      for (const resolution of resolutions) {
        extractors.push(createExtractor(createOllama(model), resolution, selfConsistency));
      }
      continue;
    }

    console.log(
      `  note: unknown --vlm "${which}", ignored. ` +
        'Known: gemini, groq, ollama, ollama:<model> (e.g. ollama:qwen3-vl:2b).',
    );
  }

  return extractors;
}
