/**
 * OCR wiring (plan.md §16).
 *
 * `documentService` ships with a placeholder vision extractor and a
 * `setVisionExtractor` seam for exactly this: registering the real cascade at
 * boot swaps in pdfjs + Tesseract without the service knowing either exists.
 */
import { logger } from '../config/logger';
import { setVisionExtractor } from '../services/documentService';
import { ocrVisionExtractor } from './cascade';

export { runOcr, ocrVisionExtractor } from './cascade';
export { shutdownOcr } from './tesseract';
export { sniff, type SniffedKind } from './sniff';
export type { OcrEngine, OcrOutcome } from './types';

export function initOcr(): void {
  setVisionExtractor(ocrVisionExtractor);
  logger.info({ lang: process.env.OCR_LANG ?? 'eng' }, 'ocr cascade registered');
}
