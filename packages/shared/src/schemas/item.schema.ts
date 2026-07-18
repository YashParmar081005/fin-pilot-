import { z } from 'zod';
import { rateIsValidOn } from '../constants/gst';

/**
 * Item contracts (plan.md §11, §14). gstRate is validated against the slab
 * set in force TODAY at item-create time; document-date validation happens
 * where documents are created. HSN digit sufficiency vs the company's AATO
 * (§14.3) is a service-level check — the schema cannot see the company.
 */

export const createItemSchema = z
  .object({
    kind: z.enum(['goods', 'service']),
    name: z.string().trim().min(1).max(200),
    sku: z.string().trim().max(60).optional(),
    barcode: z.string().trim().max(60).optional(),
    hsn: z
      .string()
      .regex(/^\d{4}(\d{2})?(\d{2})?$/, 'HSN must be 4, 6 or 8 digits')
      .optional(),
    sac: z
      .string()
      .regex(/^\d{6}$/, 'SAC must be 6 digits')
      .optional(),
    unit: z.string().trim().max(20).default('NOS'),
    gstRate: z.number(),
    cessRate: z.number().min(0).default(0),
    sellingPricePaise: z.number().int().min(0).default(0),
    purchasePricePaise: z.number().int().min(0).default(0),
    isPriceInclusiveOfTax: z.boolean().default(false),
    trackInventory: z.boolean().default(false),
    openingQty: z.number().min(0).default(0),
    reorderLevel: z.number().min(0).default(0),
  })
  .refine((v) => rateIsValidOn(v.gstRate, new Date()), {
    message: 'gstRate is not a valid GST slab today (12% and 28% ended 2025-09-22)',
    path: ['gstRate'],
  })
  .refine((v) => (v.kind === 'goods' ? Boolean(v.hsn) : true), {
    message: 'goods need an HSN code',
    path: ['hsn'],
  })
  .refine((v) => (v.kind === 'service' ? Boolean(v.sac) : true), {
    message: 'services need a SAC code',
    path: ['sac'],
  });

export const updateItemSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    sku: z.string().trim().max(60).optional(),
    barcode: z.string().trim().max(60).optional(),
    hsn: z
      .string()
      .regex(/^\d{4}(\d{2})?(\d{2})?$/)
      .optional(),
    sac: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    unit: z.string().trim().max(20).optional(),
    gstRate: z.number().optional(),
    cessRate: z.number().min(0).optional(),
    sellingPricePaise: z.number().int().min(0).optional(),
    purchasePricePaise: z.number().int().min(0).optional(),
    isPriceInclusiveOfTax: z.boolean().optional(),
    trackInventory: z.boolean().optional(),
    reorderLevel: z.number().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No fields to update')
  .refine((v) => v.gstRate === undefined || rateIsValidOn(v.gstRate, new Date()), {
    message: 'gstRate is not a valid GST slab today',
    path: ['gstRate'],
  });

// rows stay UNVALIDATED here — the service validates per row so one bad row
// fails alone instead of 422ing the whole batch (partial success by design)
export const importItemsSchema = z.object({
  rows: z.array(z.unknown()).min(1).max(1000),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type ImportItemsInput = z.infer<typeof importItemsSchema>;
