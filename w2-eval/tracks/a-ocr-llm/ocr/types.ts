/**
 * What an OCR provider hands back.
 *
 * A **line** rather than a word, because that is what the engines actually return and because the
 * hardest part of reading a form from loose words — deciding which of them belong together on a
 * line — is better done by something that can see the pixels than by a heuristic downstream.
 *
 * The original plan had a `lines.ts` stage that grouped words by vertical centre and split columns
 * on gap width. It is not here, and its absence is the point: PP-OCR already emits assembled lines
 * with boxes, so writing that stage would have been re-deriving, worse, information the engine had
 * already given us. Keeping it simple was not a compromise; the simpler thing is more accurate.
 */
export type OcrLine = {
  text: string;
  /** Axis-aligned bounds in image pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0-1, from the recogniser. Unlike a model's self-report, this one is worth something. */
  confidence: number;
};

export type OcrPage = {
  lines: OcrLine[];
  width: number;
  height: number;
  /** Fraction of the page dark enough to be ink. The basis of blank-region detection. */
  ink: number;
  latencyMs: number;
  engine: string;
};

export type OcrProvider = {
  readonly name: string;
  /** Where the image goes. `null` for a service on infrastructure you control. */
  readonly sendsImagesTo: string | null;
  isAvailable(): Promise<boolean>;
  unavailableReason(): string;
  read(imagePath: string): Promise<OcrPage>;
};

export class OcrError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'OcrError';
  }
}
