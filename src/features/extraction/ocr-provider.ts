import { Platform } from 'react-native';

/**
 * Reading text off a document image.
 *
 * The awkward truth this file exists to handle: **tesseract.js cannot run in Expo Go.** It ships
 * two workers and neither fits — the browser one needs `Worker`, `Blob` and `importScripts`, the
 * Node one needs `worker_threads` and `fs`, and React Native's Hermes runtime provides none of
 * them. So the same "free, no API key" OCR that works fine in the web build is simply unavailable
 * on the phone.
 *
 * Rather than pretend otherwise, the provider reports what it can do on this platform and the UI
 * says so. The alternatives on native are an API key (a vision model reads the image server-side)
 * or a development build with ML Kit — both real options, neither free of setup.
 */

export type OcrOutcome =
  | { ok: true; text: string; confidence: number }
  | { ok: false; reason: 'unavailable-on-platform' | 'failed'; detail: string };

export type OcrProvider = {
  readonly name: string;
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
  isAvailable: () => Platform.OS === 'web',

  async read(imageUri) {
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      try {
        const { data } = await worker.recognize(imageUri);
        return { ok: true, text: data.text, confidence: data.confidence / 100 };
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

/** The best provider this platform can actually run. */
export function ocrProvider(): OcrProvider {
  return browserTesseract.isAvailable() ? browserTesseract : unavailableOnNative;
}

/** Whether the running platform can read a document at all, for the UI to check before promising. */
export function canExtract(): boolean {
  return ocrProvider().isAvailable();
}
