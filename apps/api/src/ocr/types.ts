/**
 * OCR cascade types (plan.md §16).
 *
 * The cascade is cost-ordered: a clean digital PDF is read from its own text
 * layer for ₹0, a scan or a photo goes to self-hosted Tesseract for ₹0, and a
 * paid vision tier can slot in behind the same shape later. Downstream code
 * never branches on which tier ran — it only ever sees text.
 */

/** Which tier actually produced the text. */
export type OcrEngine =
  /** tier 1 — the PDF carried its own text layer. Never sent to a model. */
  | 'text-layer'
  /** tier 2 — self-hosted Tesseract read the pixels. */
  | 'tesseract'
  /** neither applied: the bytes were already plain text, or unreadable. */
  | 'passthrough';

export interface OcrOutcome {
  text: string;
  engine: OcrEngine;
  /** Mean engine confidence over the recognised words, 0–1. */
  confidence: number;
  /** Tiers 1 and 2 are self-hosted, so both are ₹0 (plan.md §16). */
  costPaise: number;
  /** Pages actually read. A page beyond the cap is neither read nor billed. */
  pages: number;
}
