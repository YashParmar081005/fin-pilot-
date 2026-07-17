/**
 * The plugin that enforces I8 (plan.md §9.1): tenant isolation at the QUERY
 * layer, not the controller layer. Every tenant-scoped model gets companyId
 * injected into every find/update/delete/aggregate from AsyncLocalStorage
 * request context. A query without a resolved companyId THROWS.
 *
 * `skipTenantScope` is greppable — CI fails the build if it appears outside
 * migrations/, jobs/, and services/admin/.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Schema } from 'mongoose';
import { Schema as MongooseSchema, Types } from 'mongoose';
import { AppError } from '../utils/AppError';

export interface RequestContext {
  userId?: Types.ObjectId;
  companyId?: Types.ObjectId;
  roleId?: Types.ObjectId;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/** Convenience: throws unless a companyId is resolved in the current context. */
export function requireCompanyContext(): Required<Pick<RequestContext, 'companyId'>> &
  RequestContext {
  const ctx = requestContext.getStore();
  if (!ctx?.companyId) throw new AppError('TENANT_CONTEXT_MISSING', 500);
  return ctx as Required<Pick<RequestContext, 'companyId'>> & RequestContext;
}

const GUARDED = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'countDocuments',
  'updateOne',
  'updateMany',
  'deleteOne',
  'deleteMany',
  'replaceOne',
] as const;

/** Registry of tenant-scoped model names — tenancy.spec iterates this. */
export const tenantScopedModels: string[] = [];

export function tenantScope(schema: Schema): void {
  schema.add({
    companyId: { type: MongooseSchema.Types.ObjectId, required: true, index: true },
  });

  schema.pre(GUARDED as unknown as RegExp, function (this: any) {
    if (this.getOptions().skipTenantScope === true) return; // admin/migration paths ONLY
    const ctx = requestContext.getStore();
    if (!ctx?.companyId) throw new AppError('TENANT_CONTEXT_MISSING', 500);
    this.where({ companyId: ctx.companyId });
  });

  schema.pre('aggregate', function () {
    if (this.options.skipTenantScope === true) return;
    const ctx = requestContext.getStore();
    if (!ctx?.companyId) throw new AppError('TENANT_CONTEXT_MISSING', 500);
    // MUST be stage 0 — a $lookup before it would read the whole collection.
    this.pipeline().unshift({ $match: { companyId: ctx.companyId } });
  });

  // pre('validate'), not pre('save') — validation of the required companyId
  // runs before save hooks would get a chance to inject it.
  schema.pre('validate', function () {
    const ctx = requestContext.getStore();
    if (!this.companyId && ctx?.companyId) this.companyId = ctx.companyId;
    if (!this.companyId) throw new AppError('TENANT_CONTEXT_MISSING', 500);
  });

  // NOTE: insertMany does not run save hooks — repositories must use create().
}
