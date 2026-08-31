import { geminiVision } from './gemini-vision';

/**
 * Reading text off a document image.
 *
 * There used to be a second, local provider here (tesseract.js) that read the image in-browser
 * with no upload. It is gone: this app has to run inside Expo Go, and tesseract's workers need
 * `Worker`/`Blob`/`importScripts` (web) or `worker_threads`/`fs` (Node) — none of which Hermes
 * provides — so it only ever worked in a plain web build, not the app this project ships. Keeping
 * a provider that runs on one platform nobody uses was just dead weight and a false sense that
 * there was a private option.
 *
 * What is left is Gemini where a key is configured, and an honest refusal where one is not. There
 * is no longer a platform on which reading a document keeps the image on the device — see
 * `unavailableOnNative` and the privacy screen it feeds.
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
      /**
       * Fields the reader identified itself, when it is able to.
       *
       * A vision model can name the fields on an identity card; label matching cannot, because an
       * ID prints no "Name:" or "Address:" to anchor to. When these are present they are preferred
       * over the matchers — see `readDocument`. Absent for a pure text engine, if one is ever
       * added back; Gemini, the only provider today, always supplies them.
       */
      fields?: Partial<Record<'fullName' | 'dob' | 'address' | 'income' | 'household', string>>;
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
 * The honest refusal provider.
 *
 * It does not attempt OCR, because nothing here can: there is no local reader on any platform
 * this app ships on. Returning a clear "not available" lets the upload flow fall through to
 * manual entry with the document still attached — a worse experience than automatic extraction,
 * but a working one, and the user is told which they got. The `detail` deliberately does not
 * suggest a browser as a workaround — there used to be a browser-local reader (tesseract.js) that
 * made that true, but it is gone, so a browser now reaches this same refusal or Gemini, never a
 * local one.
 */
const unavailableOnNative: OcrProvider = {
  name: 'none',
  sendsImagesTo: null,
  isAvailable: () => false,

  async read() {
    return {
      ok: false,
      reason: 'unavailable-on-platform',
      detail: 'Reading documents automatically is not available right now. Add the details yourself.',
    };
  },
};

/**
 * The best provider this platform can actually run.
 *
 * Gemini when a key is configured, on every platform — there is no longer a local option to
 * prefer ahead of it. Without a key, the app says it cannot read documents rather than pretending.
 */
export function ocrProvider(): OcrProvider {
  if (geminiVision.isAvailable()) return geminiVision;
  return unavailableOnNative;
}

/** Whether the running platform can read a document at all, for the UI to check before promising. */
export function canExtract(): boolean {
  return ocrProvider().isAvailable();
}
