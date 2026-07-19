/**
 * IRP/GSP client (plan.md §14.4). v1 goes through a GSP behind this
 * interface; the mock is the dev/test provider (real GSP = new file, not a
 * refactor). INV-01 is validated BEFORE transmit; the versioned official
 * ajv schema files slot in at GSP onboarding.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getEnv } from '../../config/env';
import type { InvoiceDoc } from '../../models/Invoice';
import type { CompanyDoc } from '../../models/Company';

/** Compact INV-01 (schema v1.1) shape. */
export const inv01Schema = z.object({
  Version: z.string(),
  TranDtls: z.object({ TaxSch: z.literal('GST'), SupTyp: z.enum(['B2B', 'SEZWP', 'EXP']) }),
  DocDtls: z.object({ Typ: z.literal('INV'), No: z.string().min(1), Dt: z.string() }),
  SellerDtls: z.object({
    Gstin: z.string().length(15),
    LglNm: z.string(),
    Loc: z.string(),
    Stcd: z.string().length(2),
  }),
  BuyerDtls: z.object({
    Gstin: z.string().length(15),
    LglNm: z.string(),
    Pos: z.string().length(2),
    Stcd: z.string().length(2),
  }),
  ValDtls: z.object({
    AssVal: z.number(),
    IgstVal: z.number(),
    CgstVal: z.number(),
    SgstVal: z.number(),
    TotInvVal: z.number(),
  }),
  ItemList: z
    .array(
      z.object({
        SlNo: z.string(),
        IsServc: z.enum(['Y', 'N']),
        HsnCd: z.string().optional(),
        Qty: z.number(),
        UnitPrice: z.number(),
        AssAmt: z.number(),
        GstRt: z.number(),
        TotItemVal: z.number(),
      }),
    )
    .min(1),
});
export type Inv01 = z.infer<typeof inv01Schema>;

const r = (p: number) => Math.round(p) / 100;
const dt = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

export function buildInv01(invoice: InvoiceDoc, company: CompanyDoc): Inv01 {
  return inv01Schema.parse({
    Version: getEnv().IRP_SCHEMA_VERSION ?? '1.1',
    TranDtls: {
      TaxSch: 'GST',
      SupTyp:
        invoice.supplyType === 'sez' ? 'SEZWP' : invoice.supplyType === 'export' ? 'EXP' : 'B2B',
    },
    DocDtls: { Typ: 'INV', No: invoice.invoiceNumber!, Dt: dt(invoice.issueDate) },
    SellerDtls: {
      Gstin: company.gstin!,
      LglNm: company.legalName,
      Loc: company.address?.city ?? 'NA',
      Stcd: company.stateCode,
    },
    BuyerDtls: {
      Gstin: invoice.partySnapshot!.gstin!,
      LglNm: invoice.partySnapshot!.name,
      Pos: invoice.placeOfSupplyStateCode,
      Stcd: invoice.partySnapshot!.stateCode ?? invoice.placeOfSupplyStateCode,
    },
    ValDtls: {
      AssVal: r(invoice.taxableValuePaise),
      IgstVal: r(invoice.igstPaise),
      CgstVal: r(invoice.cgstPaise),
      SgstVal: r(invoice.sgstPaise),
      TotInvVal: r(invoice.grandTotalPaise),
    },
    ItemList: invoice.lines.map((l, i) => ({
      SlNo: String(i + 1),
      IsServc: 'N',
      HsnCd: l.hsn,
      Qty: l.qty,
      UnitPrice: r(l.ratePaise),
      AssAmt: r(l.taxablePaise),
      GstRt: l.gstRate,
      TotItemVal: r(l.lineTotalPaise),
    })),
  });
}

export class IrpValidationError extends Error {
  statusCode = 400;
}
export class IrpServerError extends Error {
  statusCode = 500;
}

export interface IrpResult {
  irn: string;
  ackNo: string;
  ackDate: Date;
  signedQrCode: string;
}

export interface IrpClient {
  generateIrn(payload: Inv01): Promise<IrpResult>;
  cancelIrn(irn: string, reason: string): Promise<void>;
}

/** Deterministic mock: buyer LglNm 'FAIL4XX' → validation reject, 'FAIL5XX' → server error. */
export class MockIrpClient implements IrpClient {
  async generateIrn(payload: Inv01): Promise<IrpResult> {
    if (payload.BuyerDtls.LglNm === 'FAIL4XX')
      throw new IrpValidationError('IRP: buyer GSTIN inactive');
    if (payload.BuyerDtls.LglNm === 'FAIL5XX') throw new IrpServerError('IRP: gateway timeout');
    const irn = createHash('sha256')
      .update(`${payload.SellerDtls.Gstin}${payload.DocDtls.No}`)
      .digest('hex');
    return {
      irn,
      ackNo: `ACK${irn.slice(0, 12)}`,
      ackDate: new Date(),
      signedQrCode: `QR:${irn.slice(0, 32)}`,
    };
  }
  async cancelIrn(): Promise<void> {}
}

let client: IrpClient | null = null;
export function getIrpClient(): IrpClient {
  client ??= new MockIrpClient(); // real GSP providers register here (§36 open question #1)
  return client;
}
