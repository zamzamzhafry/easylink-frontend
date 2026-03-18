import { z } from 'zod';

export const dailyAttendanceRowSchema = z.object({
  employeeId: z.number().int().positive(),
  employeeCode: z.string(),
  employeeName: z.string(),
  workDate: z.string(),
  firstIn: z.string().nullable(),
  lastOut: z.string().nullable(),
  scanCount: z.number().int().nonnegative(),
  lateMinutes: z.number().int().nonnegative(),
  earlyLeaveMinutes: z.number().int().nonnegative(),
  status: z.string(),
});

export const monthlyAttendanceRowSchema = z.object({
  employeeId: z.number().int().positive(),
  employeeCode: z.string(),
  employeeName: z.string(),
  yearMonth: z.string(),
  presentDays: z.number().int().nonnegative(),
  totalScans: z.number().int().nonnegative(),
  totalLateMinutes: z.number().int().nonnegative(),
  totalEarlyLeaveMinutes: z.number().int().nonnegative(),
});

export type DailyAttendanceRow = z.infer<typeof dailyAttendanceRowSchema>;
export type MonthlyAttendanceRow = z.infer<typeof monthlyAttendanceRowSchema>;

export type CursorPage<T> = {
  records: T[];
  nextCursor?: string;
};

export interface AttendanceReadRepository {
  listDaily(params: {
    from: string;
    to: string;
    groupIds: number[];
    cursor?: string;
    limit: number;
  }): Promise<CursorPage<DailyAttendanceRow>>;

  listMonthly(params: {
    month: string;
    groupIds: number[];
    cursor?: string;
    limit: number;
  }): Promise<CursorPage<MonthlyAttendanceRow>>;
}
