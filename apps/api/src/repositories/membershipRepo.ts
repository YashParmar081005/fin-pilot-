import type { Types } from 'mongoose';
import { Membership, type MembershipDoc } from '../models/Membership';
import { Role } from '../models/Role';

export const membershipRepo = {
  create(data: {
    userId: Types.ObjectId;
    companyId: Types.ObjectId;
    roleId: Types.ObjectId;
    status: 'invited' | 'active';
    invitedBy?: Types.ObjectId;
    acceptedAt?: Date;
  }): Promise<MembershipDoc> {
    return Membership.create(data).then((d) => d.toObject());
  },

  findActive(
    userId: Types.ObjectId | string,
    companyId: Types.ObjectId | string,
  ): Promise<MembershipDoc | null> {
    return Membership.findOne({ userId, companyId, status: 'active' }).lean();
  },

  find(
    userId: Types.ObjectId | string,
    companyId: Types.ObjectId | string,
  ): Promise<MembershipDoc | null> {
    return Membership.findOne({ userId, companyId }).lean();
  },

  listActiveForUser(userId: Types.ObjectId | string): Promise<MembershipDoc[]> {
    return Membership.find({ userId, status: 'active' }).lean();
  },

  listForCompany(companyId: Types.ObjectId | string): Promise<MembershipDoc[]> {
    return Membership.find({ companyId }).lean();
  },

  listUserIdsByRole(roleId: Types.ObjectId | string): Promise<MembershipDoc[]> {
    return Membership.find({ roleId, status: 'active' }).lean();
  },

  activate(id: Types.ObjectId, roleId: Types.ObjectId): Promise<MembershipDoc | null> {
    return Membership.findByIdAndUpdate(
      id,
      { status: 'active', roleId, acceptedAt: new Date() },
      { new: true },
    ).lean();
  },

  update(
    userId: Types.ObjectId | string,
    companyId: Types.ObjectId | string,
    patch: { roleId?: Types.ObjectId; status?: 'active' | 'suspended' },
  ): Promise<MembershipDoc | null> {
    return Membership.findOneAndUpdate({ userId, companyId }, patch, { new: true }).lean();
  },

  /** Permission resolution for authorize() (§17.4): active membership → role → permissions. */
  async resolvePermissions(
    userId: Types.ObjectId | string,
    companyId: Types.ObjectId | string,
  ): Promise<string[]> {
    const membership = await Membership.findOne({ userId, companyId, status: 'active' }).lean();
    if (!membership) return [];
    const role = await Role.findById(membership.roleId).lean();
    return role?.permissions ?? [];
  },
};
