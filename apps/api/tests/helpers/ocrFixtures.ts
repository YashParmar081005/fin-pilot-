/**
 * Real file fixtures for the OCR specs (plan.md §16).
 *
 * The point of these helpers is that the specs feed the pipeline GENUINE
 * bytes — a real PDF with a real text layer, a real PNG, a real "scanned"
 * PDF whose only content is a photographed page. A mock buffer would prove
 * nothing about pdfjs or Tesseract actually working.
 */
import { createCanvas, type Canvas } from '@napi-rs/canvas';

/** Assemble a PDF from pre-serialised objects, computing the xref offsets. */
function assemblePdf(bodies: Buffer[]): Buffer {
  const header = Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1');
  const chunks: Buffer[] = [header];
  const offsets: number[] = [];
  let pos = header.length;

  bodies.forEach((body, i) => {
    const obj = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`, 'latin1'),
      body,
      Buffer.from('\nendobj\n', 'latin1'),
    ]);
    offsets.push(pos);
    chunks.push(obj);
    pos += obj.length;
  });

  let xref = `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'latin1'));

  return Buffer.concat(chunks);
}

/** `(`, `)` and `\` are the only characters a PDF literal string must escape. */
const escapePdfString = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

function stream(dict: string, body: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(`<< ${dict} /Length ${body.length} >>\nstream\n`, 'latin1'),
    body,
    Buffer.from('\nendstream', 'latin1'),
  ]);
}

/**
 * A clean digital PDF: Helvetica text drawn as a real text layer, so
 * `getTextContent()` returns the strings and the cascade never needs OCR.
 */
export function makeTextLayerPdf(lines: string[]): Buffer {
  let content = 'BT\n/F1 12 Tf\n14 TL\n50 780 Td\n';
  lines.forEach((line, i) => {
    content += i === 0 ? '' : 'T*\n';
    content += `(${escapePdfString(line)}) Tj\n`;
  });
  content += 'ET\n';

  return assemblePdf([
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'latin1'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
        '/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      'latin1',
    ),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', 'latin1'),
    stream('', Buffer.from(content, 'latin1')),
  ]);
}

/** Draw the lines onto a white canvas — the shared basis of the raster fixtures. */
function drawLines(lines: string[]): Canvas {
  const pad = 48;
  const lineHeight = 56;
  const width = 1240;
  const height = pad * 2 + lines.length * lineHeight;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000000';
  // A large, plain face: Tesseract's accuracy collapses on small or ornate type.
  ctx.font = '36px Arial, Helvetica, sans-serif';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => ctx.fillText(line, pad, pad + i * lineHeight));
  return canvas;
}

/** A photo of a bill: a real PNG with no text layer anywhere. */
export function makeTextPng(lines: string[]): Buffer {
  return drawLines(lines).toBuffer('image/png');
}

/** The same, as a real JPEG — the format a phone camera actually produces. */
export function makeTextJpeg(lines: string[]): Buffer {
  return drawLines(lines).toBuffer('image/jpeg', 92);
}

/**
 * A scanned PDF: one page whose entire content is an embedded JPEG.
 * `getTextContent()` returns nothing, so the cascade must fall through to OCR.
 */
export function makeScannedPdf(lines: string[]): Buffer {
  const canvas = drawLines(lines);
  const jpeg = canvas.toBuffer('image/jpeg', 92);
  const { width, height } = canvas;
  const content = Buffer.from(`q\n${width} 0 0 ${height} 0 0 cm\n/Im1 Do\nQ\n`, 'latin1');

  return assemblePdf([
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'latin1'),
    Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
        '/Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>',
      'latin1',
    ),
    stream('', content),
    stream(
      `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
        '/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode',
      jpeg,
    ),
  ]);
}
