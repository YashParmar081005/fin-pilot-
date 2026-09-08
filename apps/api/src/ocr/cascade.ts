/**
 * The cost-ordered extraction cascade (plan.md §16).
 *
 *   PDF with a text layer  → read it directly.      ₹0
 *   PDF without one        → rasterise → Tesseract. ₹0
 *   PNG/JPEG/…             → Tesseract.             ₹0
 *   anything else          → the previous passthrough behaviour.
 *
 * Both implemented tiers are self-hosted, so both are free; the paid vision
 * tier §16 describes slots in below Tesseract without changing this shape.
 *
 * Failure is closed, never invented. If a tier throws, the cascade logs and
 * falls through, and an unreadable document yields empty text — which the
 * field parser turns into nulls and the UI renders as "not read — fill by
 * hand". That is the safe outcome; a fabricated total is not.
 */
import { logger } from '../config/logger';
import type { VisionExtractor } from '../services/documentService';
import { normalizeOcrText } from './normalize';
import { readTextLayer, renderPages } from './pdf';
import { sniff } from './sniff';
import { recognize } from './tesseract';
import type { OcrOutcome } from './types';

/** OCR costs ~1 s per page; a 200-page statement must not hold a request open. */
const MAX_PAGES = Number(process.env.OCR_MAX_PAGES ?? 5);

/**
 * Below this much real text, a "text layer" is a scanner's stray watermark
 * rather than an invoice, and the page is worth rasterising.
 */
const TEXT_LAYER_MIN_CHARS = 24;

/**
 * What the previous mock charged for anything it could not identify. Kept so
 * that byte streams the new tiers do not recognise behave exactly as before.
 */
const PASSTHROUGH_COST_PAISE = 150;

/** The text layer is trusted; pdfjs reports the glyphs the file itself names. */
const TEXT_LAYER_CONFIDENCE = 0.99;

async function fromPdf(content: Buffer): Promise<OcrOutcome | null> {
  const layer = await readTextLayer(content);
  if (layer.text.replace(/\s/g, '').length >= TEXT_LAYER_MIN_CHARS) {
    return {
      text: normalizeOcrText(layer.text),
      engine: 'text-layer',
      confidence: TEXT_LAYER_CONFIDENCE,
      costPaise: 0,
      pages: layer.pages,
    };
  }

  // No usable text layer — this is a scan. Rasterise and read the pixels.
  const images = await renderPages(content, MAX_PAGES);
  if (images.length === 0) return null;
  const read = await recognize(images);
  return {
    text: normalizeOcrText(read.text),
    engine: 'tesseract',
    confidence: read.confidence,
    costPaise: 0,
    pages: images.length,
  };
}

async function fromImage(content: Buffer): Promise<OcrOutcome> {
  const read = await recognize([content]);
  return {
    text: normalizeOcrText(read.text),
    engine: 'tesseract',
    confidence: read.confidence,
    costPaise: 0,
    pages: 1,
  };
}

/** Bytes that are neither PDF nor image: treat them as text, as before. */
const passthrough = (content: Buffer): OcrOutcome => ({
  text: content.toString('utf8'),
  engine: 'passthrough',
  confidence: 0.8,
  costPaise: PASSTHROUGH_COST_PAISE,
  pages: 1,
});

export async function runOcr(content: Buffer): Promise<OcrOutcome> {
  const kind = sniff(content);
  try {
    if (kind === 'pdf') return (await fromPdf(content)) ?? passthrough(content);
    if (kind === 'image') return await fromImage(content);
  } catch (err) {
    // A corrupt upload is a bad document, not a broken server: log it and
    // hand back nothing rather than 500-ing the upload.
    logger.error({ err, kind, bytes: content.length }, 'ocr extraction failed');
    return { text: '', engine: 'passthrough', confidence: 0, costPaise: 0, pages: 0 };
  }
  return passthrough(content);
}

/**
 * The adapter the document service consumes. It only wants text and a cost;
 * the engine and confidence stay inside the cascade for logging.
 */
export const ocrVisionExtractor: VisionExtractor = {
  async extract(content: Buffer) {
    const outcome = await runOcr(content);
    logger.info(
      {
        engine: outcome.engine,
        pages: outcome.pages,
        confidence: Number(outcome.confidence.toFixed(2)),
        costPaise: outcome.costPaise,
        chars: outcome.text.length,
      },
      'ocr extraction complete',
    );
    return {
      text: outcome.text,
      costPaise: outcome.costPaise,
      // Tier 1 is the document's own text layer; both OCR tiers are "vision"
      // as far as the document record's vocabulary goes.
      engine: outcome.engine === 'text-layer' ? 'text-layer' : 'vision',
    };
  },
};
