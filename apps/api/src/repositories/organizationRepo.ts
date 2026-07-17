import type { Types } from 'mongoose';
import { Organization, type OrganizationDoc } from '../models/Organization';

export const organizationRepo = {
  create(data: {
    name: string;
    slug: string;
    ownerUserId: Types.ObjectId;
    type?: 'business' | 'ca_firm';
  }): Promise<OrganizationDoc> {
    return Organization.create(data).then((d) => d.toObject());
  },

  findById(id: Types.ObjectId | string): Promise<OrganizationDoc | null> {
    return Organization.findById(id).lean();
  },

  findByOwner(ownerUserId: Types.ObjectId | string): Promise<OrganizationDoc | null> {
    return Organization.findOne({ ownerUserId }).lean();
  },
};
