import * as ImagePicker from 'expo-image-picker';

/**
 * Getting a real document into the app.
 *
 * Until this existed, nothing could enter the pipeline — the Profile buttons fabricated a
 * document for a fixed sample applicant regardless of what the user tapped, which made every
 * downstream stage a demo of itself.
 *
 * Images are downscaled before they go anywhere. That is partly latency and partly restraint:
 * a smaller image is less of the document leaving the device, and an ID photographed at full
 * sensor resolution carries far more detail than reading a name off it requires.
 */

/** Long edge, in pixels. Enough for OCR to read 10pt type; far short of a forensic scan. */
const MAX_EDGE = 1600;

export type PickedDocument = {
  uri: string;
  width: number;
  height: number;
  /** Bytes, when the platform reports it. */
  size?: number;
  mimeType?: string;
};

export type PickOutcome =
  | { ok: true; document: PickedDocument }
  | { ok: false; reason: 'cancelled' | 'permission-denied' | 'unsupported'; detail?: string };

/**
 * The camera.
 *
 * Permission is requested at the moment of use rather than on launch, so the ask arrives with
 * obvious context — somebody who has just tapped "scan with camera" knows why they are being
 * asked.
 */
export async function captureDocument(): Promise<PickOutcome> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return { ok: false, reason: 'permission-denied', detail: 'camera' };
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: false,
    exif: false, // Location and device metadata are not needed to read a name off a page.
  });

  return toOutcome(result);
}

/** The photo library or Files. */
export async function chooseDocument(): Promise<PickOutcome> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: false,
    exif: false,
  });

  return toOutcome(result);
}

function toOutcome(result: ImagePicker.ImagePickerResult): PickOutcome {
  if (result.canceled || result.assets.length === 0) {
    return { ok: false, reason: 'cancelled' };
  }

  const asset = result.assets[0];
  return {
    ok: true,
    document: {
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      size: asset.fileSize,
      mimeType: asset.mimeType,
    },
  };
}

/**
 * Whether an image is worth sending to extraction at all.
 *
 * A cheap local check beats discovering the photo is unusable after a slow round-trip, and it is
 * kinder to say "that came out too small, try again" straight away than to return an empty form
 * and let the applicant guess why.
 */
export function looksReadable(document: PickedDocument): { ok: boolean; reason?: string } {
  const longEdge = Math.max(document.width, document.height);
  if (longEdge < 600) {
    return { ok: false, reason: 'That image is too small to read. Try again, closer to the page.' };
  }
  return { ok: true };
}

export { MAX_EDGE };
