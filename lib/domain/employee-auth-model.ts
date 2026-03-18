import { z } from 'zod';

export const employeeRoleSchema = z.enum(['admin', 'leader', 'scheduler', 'viewer']);

export const employeeSessionSchema = z.object({
  employeeId: z.number().int().positive(),
  employeeCode: z.string(),
  displayName: z.string(),
  roles: z.array(employeeRoleSchema),
  groupIds: z.array(z.number().int().positive()),
  expiresAt: z.number().int().positive(),
});

export type EmployeeRole = z.infer<typeof employeeRoleSchema>;
export type EmployeeSession = z.infer<typeof employeeSessionSchema>;

export type EmployeeMachineIdentity = {
  employeeId: number;
  deviceSn: string;
  pin: string;
  validFrom: string;
  validTo: string | null;
};

export const canViewDashboard = (roles: EmployeeRole[]): boolean => {
  return roles.includes('admin') || roles.includes('leader') || roles.includes('viewer');
};

export const canManageSchedule = (roles: EmployeeRole[]): boolean => {
  return roles.includes('admin') || roles.includes('scheduler');
};
