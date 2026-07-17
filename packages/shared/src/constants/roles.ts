import type { Permission } from '../permissions';

/**
 * System roles — the §2.1 RBAC matrix as data. Seeded per organization,
 * flagged isSystem (not editable). Roles are bags of permissions; application
 * code only ever checks permissions, never role keys (§2.1).
 */
export interface SystemRoleDef {
  key: string;
  name: string;
  permissions: readonly Permission[];
}

export const SYSTEM_ROLES: readonly SystemRoleDef[] = [
  {
    key: 'owner',
    name: 'Org Owner',
    permissions: [
      'company:create',
      'company:delete',
      'company:update',
      'user:invite',
      'role:assign',
      'journal:post',
      'journal:reverse',
      'invoice:create',
      'expense:submit',
      'expense:approve',
      'bank:reconcile',
      'ims:action',
      'period:close',
      'report:read',
      'audit:export',
      'ai:read',
      'ai:write',
    ],
  },
  {
    key: 'company_admin',
    name: 'Company Admin',
    permissions: [
      'company:update',
      'user:invite',
      'role:assign',
      'journal:post',
      'journal:reverse',
      'invoice:create',
      'expense:submit',
      'expense:approve',
      'bank:reconcile',
      'ims:action',
      'period:close',
      'report:read',
      'audit:export',
      'ai:read',
      'ai:write',
    ],
  },
  {
    key: 'accountant',
    name: 'Accountant',
    permissions: [
      'journal:post',
      'journal:reverse',
      'invoice:create',
      'expense:submit',
      'expense:approve',
      'bank:reconcile',
      'ims:action',
      'report:read',
      'ai:read',
      'ai:write',
    ],
  },
  {
    key: 'employee',
    name: 'Employee',
    permissions: ['expense:submit', 'ai:read'],
  },
  {
    key: 'auditor',
    name: 'Auditor (read-only)',
    permissions: ['report:read', 'audit:export', 'ai:read'],
  },
] as const;

export type SystemRoleKey = 'owner' | 'company_admin' | 'accountant' | 'employee' | 'auditor';

/** Roles that can be granted through the invite flow — never 'owner'. */
export const INVITABLE_ROLE_KEYS: readonly SystemRoleKey[] = [
  'company_admin',
  'accountant',
  'employee',
  'auditor',
];
