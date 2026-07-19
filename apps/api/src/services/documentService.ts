/**
 * Documents + OCR cascade (plan.md §16, §32 Phase 18).
 * Cascade: text layer (₹0) → vision (paid, behind an interface; real
 * Tesseract/Gemini/DocAI providers slot in at config). The extraction
 * CONTRACT: every field carries confidence; below threshold the value is
 * NULL — a low-confidence field renders empty, never guessed. The
 * arithmetic cross-check flags taxable+tax ≠ total.
 */
import { validateGstin } from '@finpilot/shared';
import { Document, type DocumentDoc, type ExtractedField } from '../models/Document';
import { billService } from './billService';
import { requireCompanyContext } from '../plugins/tenantScope';
import { AppError } from '../utils/AppError';

const CONFIDENCE_FLOOR = 0.7;

function gate<T>(value: T | null, confidence: number): ExtractedField<T> {
  return { value: confidence >= CONFIDENCE_FLOOR ? value : null, confidence };
}

/** Field parsing over raw text — the same contract for both cascade tiers. */
export function parseInvoiceText(text: string, baseConfidence: number) {
  const gstinMatch = /\b(\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d])\b/.exec(text);
  const gstin = gstinMatch && validateGstin(gstinMatch[1]!) ? gstinMatch[1]! : null;
  const numberMatch = /(?:invoice|bill)\s*(?:no\.?|number|#)\s*[:-]?\s*([A-Z0-9/-]+)/i.exec(text);
  const dateMatch = /\b(\d{2}[/-]\d{2}[/-]\d{4})\b/.exec(text);
  const vendorMatch = /^\s*(.+?)\s*$/m.exec(text); // first non-empty line
  const money = (label: RegExp) => {
    const m = label.exec(text); // labels below use [:-]? — no escapes needed
    if (!m) return null;
    const n = Number(m[1]!.replace(/,/g, ''));
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  };
  const totalPaise = money(/total\s*[:-]?\s*(?:rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i);
  const taxablePaise = money(
    /taxable\s*(?:value)?\s*[:-]?\s*(?:rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  );
  const taxPaise = money(
    /(?:gst|tax)\s*(?:amount)?\s*[:-]?\s*(?:rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  );

  // arithmetic cross-check drops confidence on the numbers when it fails
  const arithmeticOk =
    totalPaise !== null && taxablePaise !== null && taxPaise !== null
      ? taxablePaise + taxPaise === totalPaise
      : null;
  const numberConfidence = arithmeticOk === false ? 0.4 : baseConfidence;

  return {
    vendorName: gate(vendorMatch?.[1] ?? null, vendorMatch ? baseConfidence : 0),
    gstin: gate(gstin, gstin ? 0.99 : 0),
    documentNumber: gate(numberMatch?.[1] ?? null, numberMatch ? baseConfidence : 0),
    documentDate: gate(dateMatch?.[1] ?? null, dateMatch ? baseConfidence : 0),
    totalPaise: gate(totalPaise, totalPaise !== null ? numberConfidence : 0),
    taxablePaise: gate(taxablePaise, taxablePaise !== null ? numberConfidence : 0),
    arithmeticOk,
  };
}

/** Vision tier — paid; the mock "reads" the buffer as text at lower confidence. */
export interface VisionExtractor {
  extract(content: Buffer): Promise<{ text: string; costPaise: number }>;
}
let vision: VisionExtractor = {
  async extract(content) {
    return { text: content.toString('utf8'), costPaise: 150 }; // ~₹1.50/page
  },
};
export const setVisionExtractor = (v: VisionExtractor): void => void (vision = v);

export const documentService = {
  async upload(input: {
    filename: string;
    mimeType: string;
    contentBase64: string;
  }): Promise<DocumentDoc> {
    const ctx = requireCompanyContext();
    const content = Buffer.from(input.contentBase64, 'base64');
    const doc = await Document.create({
      filename: input.filename,
      mimeType: input.mimeType,
      content,
      uploadedBy: ctx.userId,
    });

    // tier 1 — the text layer, free. "text/*" (and PDFs with a text layer,
    // which the real pdf parser detects) never touch a paid API.
    const hasTextLayer =
      input.mimeType.startsWith('text/') || input.mimeType === 'application/pdf+text';
    if (hasTextLayer) {
      doc.extraction = parseInvoiceText(content.toString('utf8'), 0.95);
      doc.extractedBy = 'text-layer';
      doc.costPaise = 0; // a clean PDF costs ₹0 to extract
    } else {
      const result = await vision.extract(content);
      doc.extraction = parseInvoiceText(result.text, 0.8);
      doc.extractedBy = 'vision';
      doc.costPaise = result.costPaise;
    }
    doc.status = 'extracted';
    await doc.save();
    return doc.toObject();
  },

  async get(id: string): Promise<DocumentDoc> {
    const doc = await Document.findOne({ _id: id }).lean();
    if (!doc) throw new AppError('SYS_NOT_FOUND', 404);
    return doc as unknown as DocumentDoc; // lean() types content as BSON Binary
  },

  /**
   * "Create bill from document": only HIGH-confidence fields flow into the
   * draft; amounts are recomputed server-side at approval anyway (I5).
   */
  async createBill(documentId: string, input: { partyId: string; gstRate: number }) {
    const doc = await Document.findOne({ _id: documentId });
    if (!doc?.extraction) throw new AppError('DOC_INVALID_STATE', 409);
    if (doc.billId)
      throw new AppError('DOC_INVALID_STATE', 409, { reason: 'bill already created' });
    const ex = doc.extraction;
    if (!ex.documentNumber.value || !ex.taxablePaise.value) {
      throw new AppError('SYS_VALIDATION_FAILED', 422, {
        reason: 'low-confidence extraction — review and fill the empty fields first',
      });
    }
    const dmy = /(\d{2})[/-](\d{2})[/-](\d{4})/.exec(ex.documentDate.value ?? '');
    const bill = await billService.create({
      partyId: input.partyId,
      vendorBillNumber: ex.documentNumber.value,
      billDate: dmy ? new Date(Date.UTC(+dmy[3]!, +dmy[2]! - 1, +dmy[1]!)) : new Date(),
      dueDate: undefined,
      lines: [
        {
          description: `As per ${doc.filename}`,
          qty: 1,
          ratePaise: ex.taxablePaise.value,
          gstRate: input.gstRate,
          cessRate: 0,
          itcEligible: true,
        },
      ],
      notes: `Created from document ${doc.filename}`,
      recurring: undefined,
    });
    doc.billId = bill._id;
    await doc.save();
    return bill;
  },
};
