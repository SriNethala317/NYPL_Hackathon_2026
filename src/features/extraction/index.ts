export { extractFields, matchesExpected, normalizeMoney, normalizeName } from './field-matchers';
export type { ExtractedField } from './field-matchers';
export {
  captureDocument,
  chooseDocument,
  looksReadable,
  MAX_EDGE,
  type PickedDocument,
  type PickOutcome,
} from './pick-document';
export { canExtract, ocrProvider, type OcrOutcome, type OcrProvider } from './ocr-provider';
export { createGeminiProvider, geminiVision, type GeminiOptions } from './gemini-vision';
export { redact, containsSensitive, REDACTED } from './redact';
export { readDocument, type ReadOutcome } from './read-document';
export {
  extractW2,
  annualIncome,
  describeInvokeError,
  type W2Extraction,
  type ExtractOutcome,
  type ArithmeticCheck,
} from './extract-w2';
