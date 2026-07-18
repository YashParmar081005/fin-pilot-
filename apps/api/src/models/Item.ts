/**
 * Item — products and services (plan.md §11). Tenant-scoped, optimistic
 * concurrency. gstRate stores the CURRENT rate; documents snapshot the rate
 * at their date (§14.1) — never look it up from Item at read time.
 */
import { Schema, model, type Types } from 'mongoose';
import { tenantScope } from '../plugins/tenantScope';

export interface ItemDoc {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  kind: 'goods' | 'service';
  name: string;
  sku?: string;
  barcode?: string;
  hsn?: string; // 4 digits if AATO ≤ ₹5 Cr, 6 above (§14.3)
  sac?: string;
  unit: string;
  gstRate: number;
  cessRate: number;
  sellingPricePaise: number;
  purchasePricePaise: number;
  isPriceInclusiveOfTax: boolean;
  trackInventory: boolean;
  incomeAccountId?: Types.ObjectId | null;
  expenseAccountId?: Types.ObjectId | null;
  inventoryAccountId?: Types.ObjectId | null;
  openingQty: number;
  reorderLevel: number;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ItemSchema = new Schema<ItemDoc>(
  {
    kind: { type: String, enum: ['goods', 'service'], required: true },
    name: { type: String, required: true },
    sku: String,
    barcode: String,
    hsn: String,
    sac: String,
    unit: { type: String, default: 'NOS' },
    gstRate: { type: Number, required: true },
    cessRate: { type: Number, default: 0 },
    sellingPricePaise: { type: Number, default: 0 },
    purchasePricePaise: { type: Number, default: 0 },
    isPriceInclusiveOfTax: { type: Boolean, default: false },
    trackInventory: { type: Boolean, default: false },
    incomeAccountId: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
    expenseAccountId: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
    inventoryAccountId: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
    openingQty: { type: Number, default: 0 },
    reorderLevel: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, optimisticConcurrency: true },
);

ItemSchema.plugin(tenantScope);
// NOT `sparse` — on a compound index sparse only skips docs missing ALL keys,
// and companyId is always present, so sku-less items would collide on null.
ItemSchema.index(
  { companyId: 1, sku: 1 },
  { unique: true, partialFilterExpression: { sku: { $type: 'string' } } },
);
ItemSchema.index({ name: 'text' });

export const Item = model<ItemDoc>('Item', ItemSchema);
