import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Getting an image small enough to send, without losing the digits.
 *
 * Resolution is the central tuning variable for this track and it interacts directly with cost,
 * because image tokens scale with pixel count. It is also the variable most likely to silently
 * ruin accuracy: W-2 box text is small, and a downscale aggressive enough to save real money is
 * also aggressive enough to turn an 8 into a 3.
 *
 * So it is a parameter, measured at three settings rather than guessed at once.
 *
 * ## This is the one file that will not port to React Native as written
 *
 * It shells out to ImageMagick, which Hermes cannot do. In the app the same resize is
 * `expo-image-manipulator`, which ships in Expo Go. The *contract* is what ports — long edge, JPEG
 * quality, resulting byte count — and the harness measures the same bytes the app would send, which
 * is the part that has to be true for these numbers to mean anything.
 */

export type Resolution = 'low' | 'mid' | 'high';

/** Long-edge pixels per setting. */
export const RESOLUTIONS: Record<Resolution, number> = {
  low: 1024,
  mid: 1600,
  high: 2200,
};

export const JPEG_QUALITY = 80;

export type Prepared = {
  base64: string;
  bytes: number;
  resolution: Resolution;
  longEdge: number;
};

/**
 * Downscales to the setting's long edge and re-encodes as JPEG.
 *
 * Never upscales: a fixture rendered at 1000px wide stays at 1000px on the `high` setting rather
 * than being interpolated up to 2200. Inventing pixels would make `high` look like it recovers
 * detail that was never captured, which is exactly the false conclusion this experiment must not
 * reach.
 */
export async function prepare(imagePath: string, resolution: Resolution): Promise<Prepared> {
  const longEdge = RESOLUTIONS[resolution];
  const out = join(tmpdir(), `w2-${resolution}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);

  try {
    await run('magick', [
      imagePath,
      // The trailing '>' is ImageMagick's "only shrink" flag.
      '-resize',
      `${longEdge}x${longEdge}>`,
      '-quality',
      String(JPEG_QUALITY),
      out,
    ]);

    const buffer = await readFile(out);
    return {
      base64: buffer.toString('base64'),
      bytes: buffer.byteLength,
      resolution,
      longEdge,
    };
  } finally {
    await rm(out, { force: true });
  }
}
