import type { EmployeeMachineIdentity } from '@/lib/domain/employee-auth-model';
import type { MachineGateway, MachineScanlog } from '@/lib/domain/machine-gateway';

export type ScanlogEventInsert = {
  sourceEventKey: string;
  deviceSn: string;
  eventTime: string;
  pinRaw: string;
  verifyMode: number | null;
  ioMode: number | null;
  workcode: string | null;
  payloadJson: Record<string, unknown>;
};

export interface ScanlogEventRepository {
  insertManyIgnoreDuplicates(rows: ScanlogEventInsert[], batchId: number): Promise<number>;
}

export interface SyncBatchRepository {
  openBatch(deviceSn: string, from: string, to: string): Promise<number>;
  closeBatch(
    batchId: number,
    status: 'success' | 'partial' | 'failed',
    pulledCount: number,
    insertedCount: number,
    errorMessage?: string
  ): Promise<void>;
  loadCursor(deviceSn: string, streamKey: string): Promise<string | undefined>;
  saveCursor(deviceSn: string, streamKey: string, cursor?: string): Promise<void>;
}

export interface EmployeeIdentityRepository {
  resolveByDevicePin(
    deviceSn: string,
    pin: string,
    atDate: string
  ): Promise<EmployeeMachineIdentity | null>;
}

export const buildSourceEventKey = (row: MachineScanlog): string => {
  return [
    row.sn,
    row.scan_date,
    row.scan_time,
    row.pin,
    row.verifymode ?? '',
    row.iomode ?? '',
    row.workcode ?? '',
  ].join('|');
};

export const normalizeMachineRow = (row: MachineScanlog): ScanlogEventInsert => {
  const eventTime = `${row.scan_date}T${row.scan_time}`;
  return {
    sourceEventKey: buildSourceEventKey(row),
    deviceSn: row.sn,
    eventTime,
    pinRaw: row.pin,
    verifyMode: row.verifymode ?? null,
    ioMode: row.iomode ?? null,
    workcode: row.workcode ?? null,
    payloadJson: row,
  };
};

type PullScanlogDeps = {
  gateway: MachineGateway;
  events: ScanlogEventRepository;
  batches: SyncBatchRepository;
};

export const pullScanlogWindow = async (
  deps: PullScanlogDeps,
  params: { deviceSn: string; from: string; to: string; limit: number; streamKey: string }
): Promise<{ pulledCount: number; insertedCount: number; nextCursor?: string }> => {
  const batchId = await deps.batches.openBatch(params.deviceSn, params.from, params.to);
  let pulledCount = 0;
  let insertedCount = 0;

  try {
    const cursor = await deps.batches.loadCursor(params.deviceSn, params.streamKey);
    const result = await deps.gateway.pullScanlogs({
      from: params.from,
      to: params.to,
      limit: params.limit,
      cursor,
    });

    pulledCount = result.records.length;
    const normalizedRows = result.records.map(normalizeMachineRow);
    insertedCount = await deps.events.insertManyIgnoreDuplicates(normalizedRows, batchId);
    await deps.batches.saveCursor(params.deviceSn, params.streamKey, result.nextCursor);
    await deps.batches.closeBatch(batchId, 'success', pulledCount, insertedCount);

    return {
      pulledCount,
      insertedCount,
      nextCursor: result.nextCursor,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown machine pull error';
    await deps.batches.closeBatch(batchId, 'failed', pulledCount, insertedCount, message);
    throw error;
  }
};
