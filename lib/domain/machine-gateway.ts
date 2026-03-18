import { z } from 'zod';

export const machineScanlogSchema = z.object({
  sn: z.string(),
  scan_date: z.string(),
  scan_time: z.string(),
  pin: z.string(),
  verifymode: z.number().int().nullable().optional(),
  iomode: z.number().int().nullable().optional(),
  workcode: z.string().nullable().optional(),
});

export const machineUserSchema = z.object({
  pin: z.string(),
  name: z.string().optional(),
});

export type MachineScanlog = z.infer<typeof machineScanlogSchema>;
export type MachineUser = z.infer<typeof machineUserSchema>;

export type MachinePullParams = {
  from: string;
  to: string;
  limit: number;
  cursor?: string;
};

export type MachinePullResult = {
  records: MachineScanlog[];
  nextCursor?: string;
};

export interface MachineGateway {
  pullScanlogs(params: MachinePullParams): Promise<MachinePullResult>;
  listUsers(): Promise<MachineUser[]>;
}

export const preferredMachineSdkOrder = ['fingerspot-easylink-ts', 'easylink-js'] as const;
