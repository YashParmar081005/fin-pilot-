/**
 * Content sniffing by magic bytes.
 *
 * The upload's declared `mimeType` is a client-supplied string, and the
 * extractor interface never receives it anyway — so the cascade decides from
 * the bytes themselves. A phone photo saved as `bill.pdf` still gets OCR'd,
 * and a real PDF mislabelled `image/jpeg` still gets its text layer read.
 */

export type SniffedKind = 'pdf' | 'image' | 'other';

/** The PDF spec tolerates junk before `%PDF-`, so search a small window. */
const PDF_HEADER_WINDOW = 1024;

const at = (buf: Buffer, bytes: readonly number[], offset = 0): boolean =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

export function sniff(content: Buffer): SniffedKind {
  if (content.subarray(0, PDF_HEADER_WINDOW).includes('%PDF-')) return 'pdf';

  // Every raster format Tesseract's bundled decoders handle.
  if (at(content, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image'; // PNG
  if (at(content, [0xff, 0xd8, 0xff])) return 'image'; // JPEG
  if (at(content, [0x47, 0x49, 0x46, 0x38])) return 'image'; // GIF87a/89a
  if (at(content, [0x42, 0x4d])) return 'image'; // BMP
  if (at(content, [0x49, 0x49, 0x2a, 0x00])) return 'image'; // TIFF little-endian
  if (at(content, [0x4d, 0x4d, 0x00, 0x2a])) return 'image'; // TIFF big-endian
  // WEBP is 'RIFF' + a 4-byte length + 'WEBP'
  if (at(content, [0x52, 0x49, 0x46, 0x46]) && at(content, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image';
  }

  return 'other';
}
