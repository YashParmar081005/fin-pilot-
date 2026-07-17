/**
 * Phase 3 acceptance — the tenant-scope plugin (I8, plan.md §9.1, §29.2):
 * - every guarded operation returns 0 rows for a foreign companyId
 * - a query/aggregate without request context throws
 * - the $match for companyId is stage 0 of every pipeline
 */
import mongoose, { Schema, Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requestContext, tenantScope } from '../../src/plugins/tenantScope';
import { AppError } from '../../src/utils/AppError';
import { connectTestDb, disconnectTestDb } from '../helpers/db';

// A representative tenant-scoped model — every book-data model from Phase 4
// onward gets the same plugin, so these mechanics hold for all of them.
interface SampleDoc {
  label?: string;
  amountPaise?: number;
  companyId: Types.ObjectId; // added by the plugin
}
const SampleSchema = new Schema<SampleDoc>({ label: String, amountPaise: Number });
SampleSchema.plugin(tenantScope);
const Sample = mongoose.model('TenancySample', SampleSchema);

const companyA = new Types.ObjectId();
const companyB = new Types.ObjectId();

function inContext<T>(companyId: Types.ObjectId, fn: () => Promise<T>): Promise<T> {
  // await INSIDE run() — Mongoose queries are lazy thenables, and awaiting
  // them outside the ALS scope would execute them without context (which is
  // exactly what the plugin must reject — see the missing-context tests).
  return requestContext.run({ companyId, userId: new Types.ObjectId() }, async () => await fn());
}

beforeAll(async () => {
  await connectTestDb();
  await inContext(companyA, async () => {
    await Sample.create({ label: 'a1', amountPaise: 100 });
    await Sample.create({ label: 'a2', amountPaise: 200 });
  });
  await inContext(companyB, async () => {
    await Sample.create({ label: 'b1', amountPaise: 300 });
  });
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('tenant scoping of reads', () => {
  it('find returns only the current tenant’s rows', async () => {
    const rows = await inContext(companyA, () => Sample.find().lean());
    expect(rows.map((r) => r.label).sort()).toEqual(['a1', 'a2']);
  });

  it('returns 0 rows when querying from a foreign tenant', async () => {
    const rows = await inContext(companyB, () =>
      Sample.find({ label: { $in: ['a1', 'a2'] } }).lean(),
    );
    expect(rows).toHaveLength(0);
  });

  it('findOne and countDocuments are scoped', async () => {
    expect(await inContext(companyB, () => Sample.findOne({ label: 'a1' }).lean())).toBeNull();
    expect(await inContext(companyA, () => Sample.countDocuments())).toBe(2);
    expect(await inContext(companyB, () => Sample.countDocuments())).toBe(1);
  });
});

describe('tenant scoping of writes', () => {
  it('updateMany cannot touch a foreign tenant', async () => {
    await inContext(companyB, () => Sample.updateMany({}, { $set: { amountPaise: 999 } }).exec());
    const aRows = await inContext(companyA, () => Sample.find().lean());
    expect(aRows.every((r) => r.amountPaise !== 999)).toBe(true);
  });

  it('deleteMany cannot touch a foreign tenant', async () => {
    await inContext(companyB, () => Sample.deleteMany({ label: 'a1' }).exec());
    expect(await inContext(companyA, () => Sample.countDocuments())).toBe(2);
  });

  it('save() injects companyId from context', async () => {
    const doc = await inContext(companyA, () => Sample.create({ label: 'a3' }));
    expect(String(doc.companyId)).toBe(String(companyA));
    await inContext(companyA, () => Sample.deleteOne({ label: 'a3' }).exec());
  });
});

describe('missing context fails closed', () => {
  it('a find without request context throws TENANT_CONTEXT_MISSING', async () => {
    await expect(Sample.find().exec()).rejects.toMatchObject({
      code: 'TENANT_CONTEXT_MISSING',
    });
  });

  it('an aggregate without request context throws', async () => {
    await expect(Sample.aggregate([{ $count: 'n' }]).exec()).rejects.toMatchObject({
      code: 'TENANT_CONTEXT_MISSING',
    });
  });

  it('a save without context or companyId throws', async () => {
    await expect(new Sample({ label: 'orphan' }).save()).rejects.toBeInstanceOf(AppError);
  });
});

describe('aggregation scoping', () => {
  it('the companyId $match is stage 0 of the pipeline', async () => {
    const agg = Sample.aggregate([
      { $sort: { label: 1 } },
      { $group: { _id: null, total: { $sum: '$amountPaise' } } },
    ]);
    const result = await inContext(companyA, () => agg.exec());

    expect(agg.pipeline()[0]).toEqual({ $match: { companyId: companyA } });
    expect(result[0].total).toBe(300); // 100 + 200 — company A only
  });
});

describe('the escape hatch', () => {
  it('skipTenantScope (admin/migration paths only) sees all tenants', async () => {
    const all = await Sample.find({}, null, { skipTenantScope: true }).lean();
    expect(all.length).toBe(3);
  });
});
