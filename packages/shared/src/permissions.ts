/**
 * The canonical permission string list (plan.md §2.1).
 *
 * Roles are bags of these strings. Never check `user.role === 'admin'` in
 * application code — always `can(user, 'journal:post', companyId)`.
 */
export const PERMISSIONS = [
  // platform
  'platform:manage',
  // org / company administration
  'company:create',
  'company:delete',
  'user:invite',
  'role:assign',
  // ledger
  'journal:post',
  'journal:reverse',
  'period:close',
  // documents
  'invoice:create',
  'expense:submit',
  'expense:approve',
  // banking
  'bank:reconcile',
  // gst
  'ims:action',
  // reporting / audit
  'report:read',
  'audit:export',
  // AI copilot
  'ai:read',
  'ai:write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
