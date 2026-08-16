import { Platform } from 'react-native';

import { geminiVision } from './gemini-vision';
import { redact } from './redact';

/**
 * Reading text off a document image.
 *
 * The awkward truth this file exists to handle: **tesseract.js cannot run in Expo Go.** It ships
 * two workers and neither fits — the browser one needs `Worker`, `Blob` and `importScripts`, the
 * Node one needs `worker_threads` and `fs`, and React Native's Hermes runtime provides none of
 * them. So the same "free, no API key" OCR that works fine in the web build is simply unavailable
 * on the phone.
 *
 * There are three answers to that and this file holds all of them, in preference order: tesseract
 * where it runs, Gemini where a key is configured, and an honest refusal where neither applies.
 * The order is not accidental — tesseract reads the image inside the browser, so where it works
 * it is the private option as well as the free one, and Gemini is what makes the phone work at
 * the cost of the photograph leaving the device.
 */

export type OcrOutcome =
  | {
      ok: true;
      text: string;
      confidence: number;
      /**
       * `neverStore` keys found and destroyed while reading, e.g. `['ssn']`. Present so the
       * reading screen can say "we saw your Social Security number and threw it away", which is a
       * stronger claim than a page handed back with a silent gap in it.
       */
      removed?: string[];
    }
  | { ok: false; reason: 'unavailable-on-platform' | 'failed'; detail: string };

export type OcrProvider = {
  readonly name: string;
  /**
   * Where the document image goes to be read, or `null` when it never leaves the device.
   *
   * The privacy screen is generated from this rather than from hand-written copy, so a provider
   * that starts sending images somewhere cannot leave the app still claiming it does not.
   */
  readonly sendsImagesTo: string | null;
  /** Whether this provider can run here at all. Checked before any UI promises extraction. */
  isAvailable(): boolean;
  read(imageUri: string): Promise<OcrOutcome>;
};

/**
 * tesseract.js, in a browser.
 *
 * Loaded lazily so the WASM core is never pulled into the native bundle, where it cannot run and
 * would only cost startup time.
 */
const browserTesseract: OcrProvider = {
  name: 'tesseract',
  // The WASM core reads the image in the page; nothing is uploaded.
  sendsImagesTo: null,
  isAvailable: () => Platform.OS === 'web',

  async read(imageUri) {
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      try {
        const { data } = await worker.recognize(imageUri);
        // Redacted for the same reason the Gemini path is: an SSN transcribed off a W-2 is a
        // plain string in memory until something removes it, whichever engine did the reading.
        const { text, removed } = redact(data.text);
        return { ok: true, text, confidence: data.confidence / 100, removed };
      } finally {
        await worker.terminate();
      }
    } catch (error) {
      return { ok: false, reason: 'failed', detail: String(error) };
    }
  },
};

/**
 * The honest native provider.
 *
 * It does not attempt OCR, because nothing here can. Returning a clear "not on this platform"
 * lets the upload flow fall through to manual entry with the document still attached — a worse
 * experience than automatic extraction, but a working one, and the user is told which they got.
 */
const unavailableOnNative: OcrProvider = {
  name: 'none',
  sendsImagesTo: null,
  isAvailable: () => false,

  async read() {
    return {
      ok: false,
      reason: 'unavailable-on-platform',
      detail:
        'Reading documents automatically is not available in this build. Add the details yourself, or open the app in a browser.',
    };
  },
};

/**
 * The best provider this platform can actually run.
 *
 * Tesseract first wherever it runs, and not only because it is free: the image never leaves the
 * browser, so on web the private option and the working option are the same one and there is no
 * reason to send anything to Google. Gemini is what makes the phone work at all, and it is chosen
 * only when a key is configured. Neither available means the app says so instead of pretending.
 */
export function ocrProvider(): OcrProvider {
  if (browserTesseract.isAvailable()) return browserTesseract;
  if (geminiVision.isAvailable()) return geminiVision;
  return unavailableOnNative;
}

/** Whether the running platform can read a document at all, for the UI to check before promising. */
export function canExtract(): boolean {
  return ocrProvider().isAvailable();
}
