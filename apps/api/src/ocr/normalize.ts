/**
 * Post-OCR normalisation — recovery, never repair.
 *
 * OCR routinely breaks a GSTIN across a space or a line wrap
 * ("27AAPFU 0939F1ZV"), and the downstream `\b`-anchored regex then misses a
 * number that is sitting right there in the text. Rejoining characters the
 * engine already read is lossless recovery, so this module does that.
 *
 * What it deliberately does NOT do is substitute characters. Tesseract
 * confuses O/0, Z/2 and S/5, and it is tempting to try those swaps until the
 * check digit passes — but a GSTIN's checksum is a single base-36 character,
 * so a search over a few dozen candidates finds a "valid" GSTIN by chance
 * often enough to be dangerous. §16 is explicit: never guess a GSTIN. A
 * misread one stays null and the UI asks a human, which is the safe failure.
 */
import { validateGstin } from '@finpilot/shared';

/** Unanchored twin of the shared GSTIN_REGEX, for "is one already here?". */
const GSTIN_IN_TEXT = /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]\b/;
const GSTIN_LENGTH = 15;

/**
 * If a checksum-valid GSTIN is hiding in the text only because OCR split it,
 * append it on its own line so the normal parser finds it. Every character
 * comes from the engine's own output; nothing is invented. Two different
 * valid GSTINs (or none) means we stay quiet.
 */
export function recoverSplitGstin(text: string): string {
  if (GSTIN_IN_TEXT.test(text)) return text;

  const compact = text.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  const found = new Set<string>();
  for (let i = 0; i + GSTIN_LENGTH <= compact.length; i++) {
    const candidate = compact.slice(i, i + GSTIN_LENGTH);
    if (validateGstin(candidate)) found.add(candidate);
  }

  const [only] = [...found];
  return found.size === 1 && only ? `${text}\nGSTIN: ${only}` : text;
}

/**
 * Collapse the ragged whitespace OCR emits while keeping the line structure
 * the field parser depends on. `\s` covers the non-breaking spaces Tesseract
 * sometimes produces, so they collapse too.
 */
export function tidyOcrText(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

export function normalizeOcrText(text: string): string {
  return recoverSplitGstin(tidyOcrText(text));
}
