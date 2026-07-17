/**
 * Company + organization lifecycle (plan.md §9, §2.1).
 * There is no /organizations endpoint (§18.5): the org is created implicitly
 * with the user's first company, system roles are seeded, and the creator
 * gets an active 'owner' membership.
 */
import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import type { CreateCompanyInput, UpdateCompanyInput } from '@finpilot/shared';
import type { CompanyDoc } from '../models/Company';
import { companyRepo } from '../repositories/companyRepo';
import { membershipRepo } from '../repositories/membershipRepo';
import { organizationRepo } from '../repositories/organizationRepo';
import { roleRepo } from '../repositories/roleRepo';
import { AppError } from '../utils/AppError';
import { permissionCache } from './permissionCache';

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'org'}-${randomBytes(3).toString('hex')}`;
}

export interface CompanyWithRole {
  company: CompanyDoc;
  roleKey: string;
  roleName: string;
}

export const companyService = {
  async create(userId: string, input: CreateCompanyInput): Promise<CompanyDoc> {
    const ownerId = new Types.ObjectId(userId);

    let org = await organizationRepo.findByOwner(ownerId);
    if (!org) {
      org = await organizationRepo.create({
        name: input.legalName,
        slug: slugify(input.legalName),
        ownerUserId: ownerId,
      });
    }
    await roleRepo.seedSystemRoles(org._id);

    const count = await companyRepo.countInOrganization(org._id);
    if (count >= org.limits.maxCompanies) {
      throw new AppError('SYS_PLAN_LIMIT_EXCEEDED', 402, {
        limit: 'maxCompanies',
        max: org.limits.maxCompanies,
        plan: org.plan,
      });
    }

    const company = await companyRepo.create({
      organizationId: org._id,
      legalName: input.legalName,
      tradeName: input.tradeName,
      pan: input.pan,
      gstin: input.gstin,
      gstRegistrationType: input.gstRegistrationType,
      stateCode: input.stateCode,
      address: input.address,
      financialYearStartMonth: input.financialYearStartMonth,
      booksBeginDate: input.booksBeginDate,
    });

    const ownerRole = await roleRepo.findByKey(org._id, 'owner');
    await membershipRepo.create({
      userId: ownerId,
      companyId: company._id,
      roleId: ownerRole!._id,
      status: 'active',
      acceptedAt: new Date(),
    });
    await permissionCache.invalidate(userId, String(company._id));

    return company;
  },

  /** The company-switcher data: every company the user can act in, with role. */
  async listForUser(userId: string): Promise<CompanyWithRole[]> {
    const memberships = await membershipRepo.listActiveForUser(userId);
    if (memberships.length === 0) return [];

    const companies = await companyRepo.findByIds(memberships.map((m) => m.companyId));
    const byId = new Map(companies.map((c) => [String(c._id), c]));

    const result: CompanyWithRole[] = [];
    for (const membership of memberships) {
      const company = byId.get(String(membership.companyId));
      if (!company) continue;
      const role = await roleRepo.findById(membership.roleId);
      result.push({ company, roleKey: role?.key ?? '?', roleName: role?.name ?? '?' });
    }
    return result;
  },

  async getForMember(userId: string, companyId: string): Promise<CompanyDoc> {
    const membership = await membershipRepo.findActive(userId, companyId);
    if (!membership) throw new AppError('TENANT_NOT_A_MEMBER', 403);
    const company = await companyRepo.findById(companyId);
    if (!company) throw new AppError('SYS_NOT_FOUND', 404);
    return company;
  },

  async update(companyId: string, patch: UpdateCompanyInput): Promise<CompanyDoc> {
    const company = await companyRepo.update(companyId, patch);
    if (!company) throw new AppError('SYS_NOT_FOUND', 404);
    return company;
  },
};
