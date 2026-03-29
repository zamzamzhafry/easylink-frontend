import { z } from 'zod';

export const canonicalEmployeeRoleSchema = z.enum(['admin', 'group_leader', 'employee']);

export const employeeRoleSchema = z.enum(['admin', 'leader', 'scheduler', 'viewer']);

export const legacyEmployeeRoleAliasSchema = z.enum([
  'admin',
  'leader',
  'scheduler',
  'viewer',
  'group_leader',
  'employee',
  'hr',
]);

export const LEGACY_EMPLOYEE_ROLE_TO_CANONICAL_ROLE = {
  admin: 'admin',
  leader: 'group_leader',
  scheduler: 'group_leader',
  viewer: 'employee',
  group_leader: 'group_leader',
  employee: 'employee',
  hr: 'group_leader',
} as const;

export const employeeSessionSchema = z.object({
  employeeId: z.number().int().positive(),
  employeeCode: z.string(),
  displayName: z.string(),
  roles: z.array(employeeRoleSchema),
  groupIds: z.array(z.number().int().positive()),
  expiresAt: z.number().int().positive(),
});

export type EmployeeRole = z.infer<typeof employeeRoleSchema>;
export type CanonicalEmployeeRole = z.infer<typeof canonicalEmployeeRoleSchema>;
export type LegacyEmployeeRoleAlias = z.infer<typeof legacyEmployeeRoleAliasSchema>;
export type EmployeeRoleLike = EmployeeRole | LegacyEmployeeRoleAlias;
export type EmployeeSession = z.infer<typeof employeeSessionSchema>;

export type EmployeeMachineIdentity = {
  employeeId: number;
  deviceSn: string;
  pin: string;
  validFrom: string;
  validTo: string | null;
};

export const toCanonicalEmployeeRole = (role: EmployeeRoleLike): CanonicalEmployeeRole => {
  return LEGACY_EMPLOYEE_ROLE_TO_CANONICAL_ROLE[role] ?? 'employee';
};

export const toCanonicalEmployeeRoles = (
  roles: readonly EmployeeRoleLike[]
): CanonicalEmployeeRole[] => {
  return [...new Set(roles.map((role) => toCanonicalEmployeeRole(role)))];
};

export const canViewDashboard = (roles: readonly EmployeeRoleLike[]): boolean => {
  const canonicalRoles = toCanonicalEmployeeRoles(roles);
  return canonicalRoles.length > 0;
};

export const canManageSchedule = (roles: readonly EmployeeRoleLike[]): boolean => {
  const canonicalRoles = toCanonicalEmployeeRoles(roles);
  return canonicalRoles.includes('admin') || canonicalRoles.includes('group_leader');
};
