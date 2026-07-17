import type { Types } from 'mongoose';
import { SYSTEM_ROLES } from '@finpilot/shared';
import { Role, type RoleDoc } from '../models/Role';

export const roleRepo = {
  /** Idempotently seeds the §2.1 system roles for an organization. */
  async seedSystemRoles(organizationId: Types.ObjectId): Promise<void> {
    await Role.bulkWrite(
      SYSTEM_ROLES.map((role) => ({
        updateOne: {
          filter: { organizationId, key: role.key },
          update: {
            $setOnInsert: {
              organizationId,
              key: role.key,
              name: role.name,
              isSystem: true,
              permissions: [...role.permissions],
            },
          },
          upsert: true,
        },
      })),
    );
  },

  findByKey(organizationId: Types.ObjectId, key: string): Promise<RoleDoc | null> {
    return Role.findOne({ organizationId, key }).lean();
  },

  findById(id: Types.ObjectId | string): Promise<RoleDoc | null> {
    return Role.findById(id).lean();
  },
};
