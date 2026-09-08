/**
 * Generate the dummy documents in docs/dummy for exercising OCR by hand.
 *
 * These are REAL files, not placeholders: genuine PDFs with a genuine text
 * layer, genuine JPEG/PNG photographs, and a genuine image-only "scan". That
 * matters, because the whole point is to prove pdfjs and Tesseract actually
 * read them rather than that a fixture round-trips.
 *
 * The wording of each document is deliberate. `parseInvoiceText` finds the
 * tax amount with /(?:gst|tax)\s*(?:amount)?\s*[:-]?\s*(?:rs\.?|₹)?([\d,]+)/i
 * and takes the FIRST match, so a line like "CGST 9%: 5,400.00" placed above
 * the total would capture "9" as the tax and break the arithmetic check.
 * Percentage break-ups are therefore left out of the machine-read block.
 *
 * Usage:  pnpm --filter @finpilot/api dummy:docs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { gstinCheckDigit } from '@finpilot/shared';
import {
  makeScannedPdf,
  makeTextJpeg,
  makeTextLayerPdf,
  makeTextPng,
} from '../tests/helpers/ocrFixtures';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', '..', '..', 'docs', 'dummy');
mkdirSync(OUT, { recursive: true });

/** A GSTIN is only accepted if its 15th character checksums, so derive it. */
const gstin = (first14: string): string => first14 + gstinCheckDigit(first14);

const SUPPLIER_GSTIN = gstin('24AALCA1533G1Z');
const LOGISTICS_GSTIN = gstin('27AAPFU0939F1Z');
const OWN_GSTIN = gstin('24AAPFU0939F1Z');
const CUSTOMER_GSTIN = gstin('29AAPFU0939F1Z');

const written: { file: string; note: string }[] = [];

function write(name: string, bytes: Buffer, note: string): void {
  writeFileSync(join(OUT, name), bytes);
  written.push({ file: name, note });
  console.log(`  ${name.padEnd(38)} ${(bytes.length / 1024).toFixed(0).padStart(5)} KB`);
}

// ── vendor bills ────────────────────────────────────────────────────────────

const packagingBill = [
  'Gujarat Packaging Co',
  'Plot 14, GIDC Estate, Vatva, Ahmedabad 382445',
  `GSTIN: ${SUPPLIER_GSTIN}`,
  'Invoice No: GPC-4471',
  'Date: 05/09/2026',
  'Corrugated boxes 5-ply, HSN 4819, 500 nos',
  'Taxable Value: 60,000.00',
  'GST Amount: 10,800.00',
  'Total: 70,800.00',
];

const logisticsBill = [
  'Mumbai Logistics Pvt Ltd',
  'Unit 7, Bhiwandi Warehousing Park, Thane 421302',
  `GSTIN: ${LOGISTICS_GSTIN}`,
  'Bill No: ML-2026-0912',
  'Date: 02/09/2026',
  'Road freight Ahmedabad to Mumbai, SAC 996511',
  'Taxable Value: 55,000.00',
  'GST Amount: 9,900.00',
  'Total: 64,900.00',
];

// Same bill, but the printed total does not equal taxable + GST. The §16
// arithmetic cross-check should drop confidence and null the amounts.
const brokenBill = [
  'Gujarat Packaging Co',
  `GSTIN: ${SUPPLIER_GSTIN}`,
  'Invoice No: GPC-4472',
  'Date: 06/09/2026',
  'Taxable Value: 60,000.00',
  'GST Amount: 10,800.00',
  'Total: 99,999.00',
];

write(
  'bill-01-digital.pdf',
  makeTextLayerPdf(packagingBill),
  'Clean PDF with a text layer. Read by pdfjs for Rs 0 — "via text-layer".',
);
write(
  'bill-02-scanned.pdf',
  makeScannedPdf(packagingBill),
  'Same bill with NO text layer (one embedded JPEG). Rasterised, then Tesseract.',
);
write(
  'bill-03-phone-photo.jpg',
  makeTextJpeg(logisticsBill),
  'A photographed bill, the format a phone camera produces. Tesseract.',
);
write(
  'bill-04-phone-photo.png',
  makeTextPng(logisticsBill),
  'The same photo as PNG, to check the format makes no difference.',
);
write(
  'bill-05-totals-dont-add-up.pdf',
  makeTextLayerPdf(brokenBill),
  'Taxable + GST != Total. Expect "x mismatch" and BLANK amounts, not a guess.',
);

// ── a deliberately poor scan ────────────────────────────────────────────────

/**
 * Small, low-contrast, slightly skewed type, saved as a heavily compressed
 * JPEG — roughly what a bill photographed in bad light looks like. Included
 * to show the failure mode: fields come back null rather than wrong.
 */
function drawPoorScan(lines: string[]): Buffer {
  const canvas = createCanvas(760, 60 + lines.length * 22);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#cfc9be'; // grubby paper, not white
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(18, 26);
  ctx.rotate(-0.9 * (Math.PI / 180)); // a hand-held camera is never square
  ctx.fillStyle = '#6b6b6b'; // washed-out ink
  ctx.font = '13px Arial, Helvetica, sans-serif';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => ctx.fillText(line, 0, i * 22));
  return canvas.toBuffer('image/jpeg', 22); // aggressive compression
}

write(
  'bill-06-poor-scan.jpg',
  drawPoorScan(packagingBill),
  'Small, skewed, low-contrast, over-compressed. Expect mostly BLANK fields.',
);

// ── a sales invoice we issued ───────────────────────────────────────────────

const salesInvoice = [
  'Sunrise Traders Pvt Ltd',
  '22 Ashram Road, Ahmedabad 380009, Gujarat',
  `GSTIN: ${OWN_GSTIN}`,
  'Invoice No: INV/2026-27/00007',
  'Date: 11/07/2026',
  `Billed to: Bengaluru Softworks, GSTIN ${CUSTOMER_GSTIN}`,
  'Annual Maintenance Contract Q2, SAC 998719',
  'Taxable Value: 1,60,000.00',
  'GST Amount: 28,800.00',
  'Total: 1,88,800.00',
];

write(
  'invoice-01-digital.pdf',
  makeTextLayerPdf(salesInvoice),
  'A sales invoice as a clean PDF. Note the inter-state IGST customer.',
);
write(
  'invoice-02-scanned.pdf',
  makeScannedPdf(salesInvoice),
  'The same invoice scanned to an image — forces the OCR tier.',
);

// ── bank statement ──────────────────────────────────────────────────────────

/**
 * Header and sign convention match what the Banking page actually posts:
 * mapping { date, narration, amount, reference } with a single signed Amount,
 * where negative means money out.
 */
const statementRows = [
  ['2026-08-05', 'NEFT CR AHMEDABAD RETAIL LLP', '218300.00', 'UTR20260805'],
  ['2026-08-12', 'NEFT CR MAHARASHTRA MILLS', '348100.00', 'UTR20260812'],
  ['2026-08-14', 'RTGS DR GUJARAT PACKAGING CO', '-159300.00', 'RTGS20260814'],
  ['2026-08-20', 'UPI DR MUMBAI LOGISTICS', '-64900.00', 'UPI20260820'],
  ['2026-08-28', 'NEFT CR BENGALURU SOFTWORKS', '188800.00', 'UTR20260828'],
  ['2026-09-01', 'CHQ PAID OFFICE RENT SEPT', '-85000.00', 'CHQ004471'],
  ['2026-09-04', 'NEFT DR TORRENT POWER', '-33040.00', 'UTR20260904'],
  ['2026-09-06', 'BANK CHARGES AUG', '-590.00', 'CHG0906'],
];

const statementCsv = ['Date,Narration,Amount,Ref', ...statementRows.map((r) => r.join(','))].join(
  '\n',
);
write(
  'bank-statement-aug-sep-2026.csv',
  Buffer.from(statementCsv, 'utf8'),
  'Paste into Banking & reco -> Import statement. Negative Amount = money out.',
);

/**
 * A statement laid out the way a bank actually prints one: a header block,
 * columns, and a RUNNING BALANCE. The balance column is the point - it lets
 * the scanner reproduce each amount and direction independently and check
 * them, so these rows import with `balanceChecked: true`.
 */
const OPENING = 542000_00;
let bal = OPENING;
const ledgerLines = statementRows.map(([d, n, a]) => {
  const paise = Math.round(Number(a) * 100);
  bal += paise;
  const [dd, mm, yyyy] = [d!.slice(8, 10), d!.slice(5, 7), d!.slice(0, 4)];
  const inr = (p: number) => (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const withdrawal = paise < 0 ? inr(-paise) : '';
  const deposit = paise > 0 ? inr(paise) : '';
  // OCR flattens the columns, so the row reads: date, narration, amount, balance
  return `${dd}/${mm}/${yyyy}  ${n}  ${withdrawal || deposit}  ${inr(bal)}`;
});

const bankStatementScan = [
  'HDFC BANK LTD - Statement of Account',
  'Sunrise Traders Pvt Ltd, 22 Ashram Road, Ahmedabad 380009',
  'Account No: XXXXXXXX1234    IFSC: HDFC0000123',
  'Period: 01/08/2026 to 08/09/2026',
  'Opening Balance: ' + (OPENING / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
  'Date        Narration                       Withdrawal    Deposit    Balance',
  ...ledgerLines,
  'Closing Balance: ' + (bal / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
];

write(
  'statement-01-digital.pdf',
  makeTextLayerPdf(bankStatementScan),
  'Bank statement WITH a running balance. Scan it in Banking & reco.',
);
write(
  'statement-02-scanned.pdf',
  makeScannedPdf(bankStatementScan),
  'The same statement with no text layer - forces Tesseract.',
);
write(
  'statement-03-photo.jpg',
  makeTextJpeg(bankStatementScan),
  'A photograph of the statement.',
);

const statementPdf = [
  'HDFC Bank — Current Account XX1234',
  'Sunrise Traders Pvt Ltd',
  'Statement period: 01/08/2026 to 08/09/2026',
  'Opening Balance: 5,42,000.00',
  ...statementRows.map(([d, n, a]) => `${d}  ${n}  ${a}`),
  'Closing Balance: 9,55,370.00',
];
write(
  'bank-statement-aug-sep-2026.pdf',
  makeTextLayerPdf(statementPdf),
  'The same statement as a PDF, for eyeballing. NOT an OCR target — see README.',
);

console.log(`\n${written.length} files written to docs/dummy\n`);
