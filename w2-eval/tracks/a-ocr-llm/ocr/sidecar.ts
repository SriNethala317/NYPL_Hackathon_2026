import { readFile } from 'node:fs/promises';

import { OcrError, type OcrPage, type OcrProvider } from './types.ts';

/**
 * The self-hosted reader.
 *
 * A plain `fetch` to a service you run, which is what makes it usable from Expo Go and what makes
 * it the only reader in this comparison where a tax document never reaches a third party.
 *
 * The default URL is `localhost` because that is right for the harness. It is wrong for a phone —
 * from a device on the same network this must be the desktop's LAN address, via
 * `PADDLE_SIDECAR_URL`. The service binds `0.0.0.0` for exactly that reason.
 */

const DEFAULT_URL = 'http://localhost:8000';

/** Generous: PP-OCR on CPU is about three seconds a page, and a cold start adds a little. */
const TIMEOUT_MS = 120_000;

function baseUrl(): string {
  return (process.env.PADDLE_SIDECAR_URL ?? DEFAULT_URL).replace(/\/$/, '');
}

type SidecarResponse = {
  lines: { text: string; x: number; y: number; w: number; h: number; confidence: number }[];
  width: number;
  height: number;
  ms: number;
  engine: string;
  ink: number;
};

export function createSidecar(): OcrProvider {
  const url = baseUrl();

  return {
    name: `sidecar:${url.replace(/^https?:\/\//, '')}`,
    // Runs on hardware you control. The entire privacy argument for this track.
    sendsImagesTo: null,

    /**
     * Probed rather than assumed.
     *
     * A missing sidecar is the most likely reason this track does not run, and finding that out
     * after the first fixture — as one line of a stack trace — is a bad way to find out. `/health`
     * costs nothing and separates "not running" from "running but broken".
     */
    async isAvailable(): Promise<boolean> {
      try {
        const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
        return response.ok;
      } catch {
        return false;
      }
    },

    unavailableReason: () =>
      `No OCR sidecar at ${url}. Start it with:\n` +
      `      cd w2-eval/tracks/a-ocr-llm/sidecar && .venv/bin/uvicorn main:app --host 0.0.0.0\n` +
      `      (set PADDLE_SIDECAR_URL to reach it from another machine)`,

    async read(imagePath: string): Promise<OcrPage> {
      const image = await readFile(imagePath);
      const started = Date.now();

      let response: Response;
      try {
        response = await fetch(`${url}/ocr`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ image_base64: image.toString('base64') }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        throw new OcrError(`${url} did not respond: ${String(error)}`, false);
      }

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 200).replace(/\s+/g, ' ');
        throw new OcrError(`sidecar returned ${response.status}: ${detail}`, response.status >= 500);
      }

      const body = (await response.json()) as SidecarResponse;

      return {
        lines: body.lines,
        width: body.width,
        height: body.height,
        ink: body.ink,
        // The service's own timing excludes the HTTP round trip, which on localhost is noise but
        // over a LAN is not. Report wall clock: that is what a phone would experience.
        latencyMs: Date.now() - started,
        engine: body.engine,
      };
    },
  };
}
