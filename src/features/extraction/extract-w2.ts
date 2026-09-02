import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { loadImage } from './gemini-vision';
import { ensureSession, supabase } from '@/features/backend';

/**
 * Sending a W-2 to be read, and getting back whether the form vouched for the answer.
 *
 * Deliberately not an `OcrProvider`. That interface returns a page of text plus five profile
 * fields, which is the right shape for the upload flow and the wrong shape here — this is a test
 * surface whose entire purpose is to show what came back, including the boxes the app will never
 * store. Forcing it through the provider seam would throw away the arithmetic result, which is the
 * only part worth looking at.
 *
 * It is also not wired into `ocrProvider()`. The existing upload path keeps working exactly as it
 * does today, so nothing regresses while this is being tried on real documents.
 */

/**
 * Long edge to downscale to before upload.
 *
 * Nothing in the app downscales today — `MAX_EDGE` in `pick-document.ts` is exported and referenced
 * nowhere, and an oversize image is refused rather than shrunk. A 12-megapixel photo is 4-6.7 MB as
 * base64; at 1600px and quality 0.8 it is closer to 300-500 KB, which is the difference between a
 * request that works on a phone connection and one that times out.
 *
 * 1600 is also what the evaluation measured at, so the accuracy figures from that corpus describe
 * this path rather than a different one.
 */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.8;

/** The ceiling `loadImage` enforces before we even try to resize. */
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

export type ArithmeticCheck = {
  /** `null` when the check could not run — half a pair proves nothing. */
  ok: boolean | null;
  detail: string;
};

export type W2Extraction = {
  fields: {
    employee_name: string | null;
    employee_address: string | null;
    tax_year: string | null;
    box1_wages: string | null;
    box3_ss_wages: string | null;
    box4_ss_tax: string | null;
    box5_medicare_wages: string | null;
    box6_medicare_tax: string | null;
  };
  arithmetic: {
    ss: ArithmeticCheck;
    medicare: ArithmeticCheck;
    /** True only when a check actually ran and passed. Unknown is not the same as fine. */
    corroborated: boolean;
    broken: boolean;
  };
  warnings: string[];
  attempts: string[];
  model: string | null;
  latencyMs: number;
  tokens: { in: number | null; out: number | null };
};

export type ExtractOutcome =
  | { ok: true; result: W2Extraction; uploadedBytes: number; totalMs: number }
  | { ok: false; detail: string };

/**
 * The income figure the benefits screener would consume, and where it came from.
 *
 * Box 5 leads because it is the closest thing on a W-2 to gross income: Box 1 is reduced by
 * pre-tax deferrals and Box 3 stops at the Social Security wage base, while Box 5 excludes only
 * pre-tax health premiums and has no cap.
 *
 * **The figure is annual.** The app's `income` profile field is documented as gross *monthly* and
 * is multiplied by twelve at the eligibility boundary, so anything consuming this later has to
 * divide. Getting that wrong overstates income twelvefold, which pushes a household over every cap
 * and hides the programmes they qualify for — silently, because nothing downstream would show it.
 */
export function annualIncome(result: W2Extraction): { value: string; from: 'box5' | 'box1' } | null {
  if (result.fields.box5_medicare_wages) return { value: result.fields.box5_medicare_wages, from: 'box5' };
  if (result.fields.box1_wages) return { value: result.fields.box1_wages, from: 'box1' };
  return null;
}

/**
 * Shrinks the photograph so the request is small enough to survive a phone connection.
 *
 * Bounds the *long* edge, which is not the same as bounding the width. A phone camera shoots
 * portrait — 3024x4032 on an iPhone — so constraining width alone to 1600 leaves a 1600x2133 image
 * whose long edge is a third larger than anything the accuracy figures were measured against, and
 * a third more bytes on the wire. Scaling both sides by one ratio also preserves the aspect ratio,
 * where passing width alone relies on the library to infer it.
 *
 * An image already inside the bound is not enlarged. Upscaling invents no detail for the model to
 * read and costs bytes to send, so the only thing it can do is make the request slower.
 */
async function downscale(uri: string): Promise<string> {
  const source = await ImageManipulator.manipulate(uri).renderAsync();
  const longest = Math.max(source.width, source.height);

  // Re-encoded as JPEG either way, so the function receives one predictable media type rather
  // than whichever format the camera or the file picker happened to hand over.
  if (longest <= MAX_EDGE) {
    const saved = await source.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
    return saved.uri;
  }

  const scale = MAX_EDGE / longest;
  const resized = await ImageManipulator.manipulate(uri)
    .resize({ width: Math.round(source.width * scale), height: Math.round(source.height * scale) })
    .renderAsync();
  const saved = await resized.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
  return saved.uri;
}

/**
 * Reads a W-2 through the Edge Function.
 *
 * The Gemini key is never here. It lives as a Supabase secret on the function, which is the only
 * arrangement that actually keeps it — `EXPO_PUBLIC_*` variables are inlined into the JS bundle at
 * build time, so a key in the app is a key in everyone's hands.
 */
export async function extractW2(uri: string): Promise<ExtractOutcome> {
  const started = Date.now();

  const db = supabase();
  if (db === null) {
    return { ok: false, detail: 'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and _ANON_KEY.' };
  }

  // The function refuses callers with no session, so establish one before spending time on the
  // image. Anonymous is enough -- it proves "this install", which is all the function needs.
  const session = await ensureSession();
  if (!session.ok) {
    return { ok: false, detail: `Could not sign in: ${session.detail}` };
  }

  let image;
  try {
    const smaller = await downscale(uri);
    image = await loadImage(smaller, MAX_SOURCE_BYTES);
  } catch (error) {
    // `loadImage` throws messages written for a person to read, so pass them through unchanged.
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }

  const { data, error } = await db.functions.invoke('extract-w2', {
    body: { imageBase64: image.base64, mimeType: image.mimeType },
  });

  if (error) {
    return { ok: false, detail: await describeInvokeError(error) };
  }

  return {
    ok: true,
    result: data as W2Extraction,
    uploadedBytes: image.bytes,
    totalMs: Date.now() - started,
  };
}

/**
 * Turning a failed `invoke()` into something a person can act on.
 *
 * `supabase-js` reports every non-2xx as the same sentence — "Edge Function returned a non-2xx
 * status code" — regardless of whether the function rejected the image, refused the caller, or was
 * never deployed at all. The distinction is entirely in the response body, which the error carries
 * on `context` and which nothing reads unless asked.
 *
 * Two body shapes matter, because two different services answer here. This function's own errors
 * are `{ error }`. The Supabase gateway's are `{ code, message }` — and the gateway is what answers
 * when the function is missing, which is the single most likely failure on a fresh project and
 * exactly the one the generic message hides.
 */
export async function describeInvokeError(error: Error): Promise<string> {
  const response = (error as { context?: unknown }).context;

  if (!(response instanceof Response)) {
    // No response at all: DNS, no network, or the request never left the phone.
    return `${error.message} (the request did not reach Supabase — check the connection and EXPO_PUBLIC_SUPABASE_URL)`;
  }

  let body: unknown = null;
  try {
    body = await response.clone().json();
  } catch {
    /* Not JSON; the status alone has to carry it. */
  }

  const fields = (body ?? {}) as { error?: unknown; message?: unknown; msg?: unknown; code?: unknown };
  const message = [fields.error, fields.message, fields.msg].find((v) => typeof v === 'string' && v);

  if (response.status === 404 || fields.code === 'NOT_FOUND') {
    return 'The extract-w2 function is not deployed to this Supabase project. Run: npx supabase functions deploy extract-w2';
  }

  if (typeof message === 'string') return message;
  return `${error.message} (HTTP ${response.status})`;
}
