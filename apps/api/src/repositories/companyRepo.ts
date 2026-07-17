import type { Types } from 'mongoose';
import { Company, type CompanyDoc } from '../models/Company';

export const companyRepo = {
  create(data: Partial<CompanyDoc> & { organizationId: Types.ObjectId }): Promise<CompanyDoc> {
    return Company.create(data).then((d) => d.toObject());
  },

  findById(id: Types.ObjectId | string): Promise<CompanyDoc | null> {
    return Company.findById(id).lean();
  },

  findByIds(ids: Types.ObjectId[]): Promise<CompanyDoc[]> {
    return Company.find({ _id: { $in: ids } }).lean();
  },

  countInOrganization(organizationId: Types.ObjectId): Promise<number> {
    return Company.countDocuments({ organizationId });
  },

  update(id: Types.ObjectId | string, patch: Record<string, unknown>): Promise<CompanyDoc | null> {
    return Company.findByIdAndUpdate(id, patch, { new: true, runValidators: true }).lean();
  },
};
