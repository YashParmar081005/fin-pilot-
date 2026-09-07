/**
 * The two PDF tiers (plan.md §16).
 *
 * Tier 1 reads the embedded text layer — a clean digital invoice costs ₹0 and
 * never touches an OCR engine. Tier 2 rasterises the pages so Tesseract has
 * pixels to read, for the scans and camera photos that carry no text at all.
 */
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

const requireFrom = createRequire(import.meta.url);
// Forward slashes with a trailing "/": under Node pdfjs reads these with
// `fs` (so a file:// URL would percent-encode the space in "fin pilot" and
// fail to open), but it still validates them as URLs and rejects a Windows
// backslash separator. This form satisfies both.
const pdfjsRoot = dirname(requireFrom.resolve('pdfjs-dist/package.json')).replaceAll('\\', '/');
// Pointed at the installed package, so a server process fetches nothing.
const standardFontDataUrl = `${pdfjsRoot}/standard_fonts/`;
const cMapUrl = `${pdfjsRoot}/cmaps/`;

/** Two text items belong to the same line within this many PDF user units. */
const LINE_TOLERANCE = 3;
/** Tesseract is tuned for 200–300 DPI; PDF user units are 72 to the inch. */
const TARGET_DPI = 200;
/** Guard against a hostile MediaBox turning into a gigapixel canvas. */
const MAX_RASTER_EDGE = 4000;

function open(content: Buffer) {
  return getDocument({
    // pdfjs takes ownership of the array it is handed and detaches it; copy,
    // because the caller still holds this Buffer for storage.
    data: new Uint8Array(content),
    standardFontDataUrl,
    cMapUrl,
    cMapPacked: true,
    // A server parses hostile files: never install fonts from one.
    useSystemFonts: false,
  });
}

/**
 * Rebuild lines from positioned glyph runs.
 *
 * `getTextContent()` returns items in draw order, not reading order, and
 * flattening them with a space collapses the page into one line. The
 * downstream field parser keys off line structure ("first non-empty line is
 * the vendor"), so the y coordinate has to be honoured.
 */
function reconstructLines(items: readonly TextItem[]): string {
  const placed = items
    .filter((item) => item.str.trim().length > 0)
    .map((item) => ({ x: item.transform[4] ?? 0, y: item.transform[5] ?? 0, str: item.str }))
    // top-to-bottom (PDF y grows upward), then left-to-right
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: string[] = [];
  let current: string[] = [];
  let lastY: number | null = null;

  for (const item of placed) {
    if (lastY !== null && Math.abs(item.y - lastY) > LINE_TOLERANCE) {
      lines.push(current.join(' '));
      current = [];
    }
    current.push(item.str);
    lastY = item.y;
  }
  if (current.length > 0) lines.push(current.join(' '));

  return lines.map((line) => line.replace(/\s+/g, ' ').trim()).join('\n');
}

export async function readTextLayer(content: Buffer): Promise<{ text: string; pages: number }> {
  const task = open(content);
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const textContent = await page.getTextContent();
      const items = textContent.items.filter((item): item is TextItem => 'str' in item);
      pages.push(reconstructLines(items));
      page.cleanup();
    }
    return { text: pages.join('\n'), pages: doc.numPages };
  } finally {
    await task.destroy();
  }
}

/** Render up to `maxPages` pages to PNG buffers for the OCR tier. */
export async function renderPages(content: Buffer, maxPages: number): Promise<Buffer[]> {
  const task = open(content);
  try {
    const doc = await task.promise;
    const images: Buffer[] = [];
    const count = Math.min(doc.numPages, maxPages);

    for (let n = 1; n <= count; n++) {
      const page = await doc.getPage(n);
      const unscaled = page.getViewport({ scale: 1 });
      const fit = MAX_RASTER_EDGE / Math.max(unscaled.width, unscaled.height);
      const viewport = page.getViewport({ scale: Math.max(1, Math.min(TARGET_DPI / 72, fit)) });

      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      // pdfjs paints ink only; an untouched canvas is transparent, which
      // Tesseract flattens to black and then reads as an empty page.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // @napi-rs/canvas is a faithful but separate implementation of the DOM
      // canvas types pdfjs declares, so the shapes need bridging here.
      await page.render({ canvasContext: ctx, viewport, canvas } as unknown as Parameters<
        typeof page.render
      >[0]).promise;

      images.push(canvas.toBuffer('image/png'));
      page.cleanup();
    }
    return images;
  } finally {
    await task.destroy();
  }
}
