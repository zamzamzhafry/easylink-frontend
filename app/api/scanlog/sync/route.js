import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import {
  forbiddenResponse,
  getAuthContextFromCookies,
  unauthorizedResponse,
} from '@/lib/auth-session';
import { pullScanlogsFromSdk } from '@/lib/easylink-sdk-client';
import {
  buildPaginatedResponse,
  computePaginationMeta,
  parsePaginationParams,
} from '@/lib/pagination';
import { getMigrationGateStatus } from '@/lib/flags/migration-flags';

function toBoundedInt(value, fallback, { min = 1, max = 100000 } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

const WORKER_CONCURRENCY = toBoundedInt(process.env.EASYLINK_SCANLOG_WORKERS, 1, {
  min: 1,
  max: 4,
});

const pendingJobs = [];
let activeWorkers = 0;
let queuePumping = false;

const batchDetails = new Map();
const MAX_BATCH_DETAILS = 100;

function upsertBatchDetail(batchId, patch) {
  if (!batchId) return;
  const existing = batchDetails.get(batchId) || {};
  const next = {
    ...existing,
    ...patch,
    batchId,
  };
  batchDetails.set(batchId, next);

  if (batchDetails.size > MAX_BATCH_DETAILS) {
    const firstKey = batchDetails.keys().next().value;
    if (firstKey) batchDetails.delete(firstKey);
  }
}

function serializeBatchRow(row) {
  if (!row) return null;
  return {
    ...row,
    debug: batchDetails.get(row.id) || null,
  };
}

async function tableExists(tableName) {
  const [rows] = await pool.query(
    `
      SELECT 1
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      LIMIT 1
    `,
    [tableName]
  );
  return rows.length > 0;
}

const DELTA_SAMPLE_LIMIT = 50;
const PROJECTION_VIEW_NAME = 'vw_compat_scanlog_safe_events';
const PROJECTION_REQUIRED_COLUMNS = [
  'source_event_key',
  'sn',
  'pin',
  'scan_at',
  'scan_date',
  'scan_time',
  'verifymode',
  'iomode',
  'workcode',
];

function toIsoString(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  return String(value);
}

function formatDateValue(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string' && value.length >= 10) {
    return value.slice(0, 10);
  }
  return String(value);
}

function formatTimeValue(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(11, 19);
  }
  if (typeof value === 'string' && value.length >= 8) {
    return value.slice(0, 8);
  }
  return String(value);
}

function normalizeSafeRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    source_event_key: row.source_event_key ?? null,
    sn: String(row.sn ?? ''),
    pin: String(row.pin ?? ''),
    scan_at: toIsoString(row.scan_at),
    scan_date: formatDateValue(row.scan_date),
    scan_time: formatTimeValue(row.scan_time),
    verifymode: Number(row.verifymode ?? 0),
    iomode: Number(row.iomode ?? 0),
    workcode: String(row.workcode ?? ''),
  };
}

function normalizeLegacyRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    sn: String(row.sn ?? ''),
    pin: String(row.pin ?? ''),
    scan_at: toIsoString(row.scan_date),
    scan_date: formatDateValue(row.scan_date),
    scan_time: formatTimeValue(row.scan_time),
    verifymode: Number(row.verifymode ?? 0),
    iomode: Number(row.iomode ?? 0),
    workcode: String(row.workcode ?? ''),
  };
}

async function countTableRows(tableName) {
  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM ??', [tableName]);
  return Number(rows?.[0]?.total ?? 0);
}

async function tableHasColumns(tableName, columns) {
  if (!columns || columns.length === 0) return true;
  const placeholders = columns.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME IN (${placeholders})
    `,
    [tableName, ...columns]
  );
  const available = new Set(rows.map((row) => row.COLUMN_NAME));
  return columns.every((column) => available.has(column));
}

function extractDeltaTotal(report, name) {
  if (!report || !Array.isArray(report.differences)) return null;
  const match = report.differences.find((diff) => diff.name === name);
  return match ? Number(match.total ?? 0) : null;
}

async function buildDeltaReport({ safeExists = false } = {}) {
  const safeTable = 'tb_scanlog_safe_events';
  const legacyTable = 'tb_scanlog';
  const warnings = [];
  const safeTableExists = safeExists || (await tableExists(safeTable));
  if (!safeTableExists) {
    warnings.push('Safe scanlog table is not available.');
  }
  const legacyTableExists = await tableExists(legacyTable);
  if (!legacyTableExists) {
    warnings.push('Legacy scanlog table is not available.');
  }
  const projectionTableExists = await tableExists(PROJECTION_VIEW_NAME);
  let projectionReady = false;
  if (projectionTableExists) {
    projectionReady = await tableHasColumns(PROJECTION_VIEW_NAME, PROJECTION_REQUIRED_COLUMNS);
    if (!projectionReady) {
      warnings.push('Projection view is missing expected columns.');
    }
  } else {
    warnings.push('Projection view is not deployed.');
  }

  const counts = {
    safe: safeTableExists ? await countTableRows(safeTable) : null,
    legacy: legacyTableExists ? await countTableRows(legacyTable) : null,
    projection: projectionReady ? await countTableRows(PROJECTION_VIEW_NAME) : null,
  };

  const safeLegacyMatchClause = `
    sl.sn = se.sn
    AND sl.pin = se.pin
    AND sl.scan_date = se.scan_at
    AND COALESCE(sl.verifymode, 0) = COALESCE(se.verifymode, 0)
    AND COALESCE(sl.iomode, 0) = COALESCE(se.iomode, 0)
    AND COALESCE(CAST(sl.workcode AS SIGNED), 0) =
        CAST(COALESCE(NULLIF(se.workcode, ''), '0') AS SIGNED)
  `;
  const legacySafeMatchClause = `
    se.sn = sl.sn
    AND se.pin = sl.pin
    AND se.scan_at = sl.scan_date
    AND COALESCE(se.verifymode, 0) = COALESCE(sl.verifymode, 0)
    AND COALESCE(se.iomode, 0) = COALESCE(sl.iomode, 0)
    AND CAST(COALESCE(NULLIF(se.workcode, ''), '0') AS SIGNED) =
        COALESCE(CAST(sl.workcode AS SIGNED), 0)
  `;

  const differences = [];

  if (safeTableExists && legacyTableExists) {
    const [safeMissingLegacyCountRows] = await pool.query(
      `
        SELECT COUNT(*) AS total
        FROM tb_scanlog_safe_events se
        WHERE NOT EXISTS (
          SELECT 1
          FROM tb_scanlog sl
          WHERE ${safeLegacyMatchClause}
        )
      `
    );
    const safeMissingLegacyCount = Number(safeMissingLegacyCountRows?.[0]?.total ?? 0);
    const [safeMissingLegacyRows] = await pool.query(
      `
        SELECT
          se.source_event_key,
          se.sn,
          se.pin,
          se.scan_at,
          DATE(se.scan_at) AS scan_date,
          TIME(se.scan_at) AS scan_time,
          COALESCE(se.verifymode, 0) AS verifymode,
          COALESCE(se.iomode, 0) AS iomode,
          COALESCE(NULLIF(se.workcode, ''), '0') AS workcode
        FROM tb_scanlog_safe_events se
        WHERE NOT EXISTS (
          SELECT 1
          FROM tb_scanlog sl
          WHERE ${safeLegacyMatchClause}
        )
        ORDER BY se.source_event_key ASC, se.scan_at ASC
        LIMIT ?
      `,
      [DELTA_SAMPLE_LIMIT]
    );
    differences.push({
      name: 'safe_not_in_legacy',
      description:
        'Safe events that do not have a matching legacy scanlog entry (sn/pin/scan_date/modes/workcode).',
      source: 'safe',
      target: 'legacy',
      total: safeMissingLegacyCount,
      sample: (safeMissingLegacyRows || []).map(normalizeSafeRow).filter(Boolean),
    });

    const [legacyMissingSafeCountRows] = await pool.query(
      `
        SELECT COUNT(*) AS total
        FROM tb_scanlog sl
        WHERE NOT EXISTS (
          SELECT 1
          FROM tb_scanlog_safe_events se
          WHERE ${legacySafeMatchClause}
        )
      `
    );
    const legacyMissingSafeCount = Number(legacyMissingSafeCountRows?.[0]?.total ?? 0);
    const [legacyMissingSafeRows] = await pool.query(
      `
        SELECT
          sl.sn,
          sl.pin,
          sl.scan_date,
          TIME(sl.scan_date) AS scan_time,
          sl.verifymode,
          sl.iomode,
          sl.workcode
        FROM tb_scanlog sl
        WHERE NOT EXISTS (
          SELECT 1
          FROM tb_scanlog_safe_events se
          WHERE ${legacySafeMatchClause}
        )
        ORDER BY sl.scan_date ASC
        LIMIT ?
      `,
      [DELTA_SAMPLE_LIMIT]
    );
    differences.push({
      name: 'legacy_not_in_safe',
      description:
        'Legacy scanlog rows that are not represented in the safe event store (sn/pin/scan_date/modes/workcode).',
      source: 'legacy',
      target: 'safe',
      total: legacyMissingSafeCount,
      sample: (legacyMissingSafeRows || []).map(normalizeLegacyRow).filter(Boolean),
    });
  }

  if (safeTableExists && projectionReady) {
    const [safeMissingProjectionCountRows] = await pool.query(
      `
        SELECT COUNT(*) AS total
        FROM tb_scanlog_safe_events se
        WHERE NOT EXISTS (
          SELECT 1
          FROM ${PROJECTION_VIEW_NAME} proj
          WHERE proj.source_event_key = se.source_event_key
        )
      `
    );
    const safeMissingProjectionCount = Number(safeMissingProjectionCountRows?.[0]?.total ?? 0);
    const [safeMissingProjectionRows] = await pool.query(
      `
        SELECT
          se.source_event_key,
          se.sn,
          se.pin,
          se.scan_at,
          DATE(se.scan_at) AS scan_date,
          TIME(se.scan_at) AS scan_time,
          COALESCE(se.verifymode, 0) AS verifymode,
          COALESCE(se.iomode, 0) AS iomode,
          COALESCE(NULLIF(se.workcode, ''), '0') AS workcode
        FROM tb_scanlog_safe_events se
        WHERE NOT EXISTS (
          SELECT 1
          FROM ${PROJECTION_VIEW_NAME} proj
          WHERE proj.source_event_key = se.source_event_key
        )
        ORDER BY se.source_event_key ASC, se.scan_at ASC
        LIMIT ?
      `,
      [DELTA_SAMPLE_LIMIT]
    );
    differences.push({
      name: 'safe_not_in_projection',
      description: 'Safe events without a projection counterpart keyed by source_event_key.',
      source: 'safe',
      target: 'projection',
      total: safeMissingProjectionCount,
      sample: (safeMissingProjectionRows || []).map(normalizeSafeRow).filter(Boolean),
    });

    const [projectionMissingSafeCountRows] = await pool.query(
      `
        SELECT COUNT(*) AS total
        FROM ${PROJECTION_VIEW_NAME} proj
        WHERE NOT EXISTS (
          SELECT 1
          FROM tb_scanlog_safe_events se
          WHERE se.source_event_key = proj.source_event_key
        )
      `
    );
    const projectionMissingSafeCount = Number(projectionMissingSafeCountRows?.[0]?.total ?? 0);
    const [projectionMissingSafeRows] = await pool.query(
      `
        SELECT
          proj.source_event_key,
          proj.sn,
          proj.pin,
          proj.scan_at,
          proj.scan_date,
          proj.scan_time,
          proj.verifymode,
          proj.iomode,
          proj.workcode
        FROM ${PROJECTION_VIEW_NAME} proj
        WHERE NOT EXISTS (
          SELECT 1
          FROM tb_scanlog_safe_events se
          WHERE se.source_event_key = proj.source_event_key
        )
        ORDER BY proj.source_event_key ASC
        LIMIT ?
      `,
      [DELTA_SAMPLE_LIMIT]
    );
    differences.push({
      name: 'projection_not_in_safe',
      description: 'Projection rows that do not have a mapped safe event counterpart.',
      source: 'projection',
      target: 'safe',
      total: projectionMissingSafeCount,
      sample: (projectionMissingSafeRows || []).map(normalizeSafeRow).filter(Boolean),
    });
  }

  return {
    deterministic: true,
    sample_limit: DELTA_SAMPLE_LIMIT,
    counts,
    differences,
    warnings,
    generated_at: new Date().toISOString(),
  };
}

if (typeof globalThis !== 'undefined') {
  Object.defineProperty(globalThis, '__easylinkDeltaReport', {
    value: buildDeltaReport,
    configurable: true,
    writable: true,
  });
}

async function openBatch({ sourceSdk, sn, from, to, status = 'running' }) {
  const [result] = await pool.query(
    `
      INSERT INTO tb_scanlog_safe_batches (
        source_sdk,
        sn,
        requested_from,
        requested_to,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, NOW())
    `,
    [sourceSdk, sn, from || null, to || null, status]
  );
  const batchId = Number(result.insertId);
  upsertBatchDetail(batchId, {
    status,
    source: sourceSdk,
    request: {
      sn,
      from,
      to,
    },
    createdAt: new Date().toISOString(),
  });
  return batchId;
}

async function markBatchRunning(batchId) {
  await pool.query(
    `
      UPDATE tb_scanlog_safe_batches
      SET status = 'running'
      WHERE id = ?
    `,
    [batchId]
  );
}

async function closeBatch(batchId, patch) {
  await pool.query(
    `
      UPDATE tb_scanlog_safe_batches
      SET status = ?,
          pulled_count = ?,
          inserted_count = ?,
          error_message = ?,
          finished_at = NOW()
      WHERE id = ?
    `,
    [
      patch.status,
      Number(patch.pulledCount || 0),
      Number(patch.insertedCount || 0),
      patch.errorMessage || null,
      batchId,
    ]
  );
}

async function getBatchById(batchId) {
  const [rows] = await pool.query(
    `
      SELECT id, source_sdk, sn, requested_from, requested_to, status,
             pulled_count, inserted_count, error_message, created_at, finished_at
      FROM tb_scanlog_safe_batches
      WHERE id = ?
      LIMIT 1
    `,
    [batchId]
  );

  return rows[0] || null;
}

async function insertSafeEvents(rows, batchId) {
  if (!rows.length) return 0;

  const values = rows.flatMap((row) => [
    row.source_event_key,
    row.source_sdk,
    row.sn,
    row.pin,
    row.scan_at,
    row.scan_date,
    row.scan_time,
    row.verifymode,
    row.iomode,
    row.workcode,
    row.raw_payload,
    batchId,
  ]);

  const placeholders = rows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');

  const [result] = await pool.query(
    `
      INSERT IGNORE INTO tb_scanlog_safe_events (
        source_event_key,
        source_sdk,
        sn,
        pin,
        scan_at,
        scan_date,
        scan_time,
        verifymode,
        iomode,
        workcode,
        raw_payload,
        batch_id
      ) VALUES ${placeholders}
    `,
    values
  );

  return Number(result.affectedRows || 0);
}

async function mergeSafeEventsIntoLegacy({ batchId, from, to }) {
  if (!batchId && !from && !to) return 0;

  const hasLegacy = await tableExists('tb_scanlog');
  if (!hasLegacy) return 0;

  const whereParts = [];
  const whereParams = [];

  const hasRange = Boolean(from || to);
  if (hasRange) {
    if (from) {
      whereParts.push('DATE(se.scan_at) >= ?');
      whereParams.push(from);
    }

    if (to) {
      whereParts.push('DATE(se.scan_at) <= ?');
      whereParams.push(to);
    }
  } else if (batchId) {
    whereParts.push('se.batch_id = ?');
    whereParams.push(batchId);
  }

  if (whereParts.length === 0) return 0;

  const [result] = await pool.query(
    `
      INSERT INTO tb_scanlog (
        sn,
        scan_date,
        pin,
        verifymode,
        iomode,
        workcode
      )
      SELECT
        se.sn,
        se.scan_at,
        se.pin,
        COALESCE(se.verifymode, 0),
        COALESCE(se.iomode, 0),
        CAST(COALESCE(NULLIF(se.workcode, ''), '0') AS SIGNED)
      FROM tb_scanlog_safe_events se
      WHERE ${whereParts.join(' AND ')}
        AND NOT EXISTS (
          SELECT 1
          FROM tb_scanlog sl
          WHERE sl.sn = se.sn
            AND sl.pin = se.pin
            AND sl.scan_date = se.scan_at
            AND COALESCE(sl.verifymode, 0) = COALESCE(se.verifymode, 0)
            AND COALESCE(sl.iomode, 0) = COALESCE(se.iomode, 0)
            AND COALESCE(CAST(sl.workcode AS SIGNED), 0) =
                CAST(COALESCE(NULLIF(se.workcode, ''), '0') AS SIGNED)
        )
    `,
    whereParams
  );

  return Number(result.affectedRows || 0);
}

export async function GET(req) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin) return forbiddenResponse('Admin only');

  const migration = getMigrationGateStatus({ viewerIsAdmin: auth.is_admin });
  const url = new URL(req.url);
  const reportType = url.searchParams.get('report');

  if (reportType === 'delta') {
    const hasSafeEvents = await tableExists('tb_scanlog_safe_events');
    if (!hasSafeEvents) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Safe scanlog tables not found. Run migration_scanlog_safe_events.sql first.',
        },
        { status: 400 }
      );
    }

    const report = await buildDeltaReport({ safeExists: true });
    return NextResponse.json({ ok: true, migration, report });
  }

  const hasTable = await tableExists('tb_scanlog_safe_batches');
  if (!hasTable) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Safe scanlog tables not found. Run migration_scanlog_safe_events.sql first.',
      },
      { status: 400 }
    );
  }

  const batchIdParam = url.searchParams.get('batch_id');

  if (batchIdParam) {
    const batchId = toBoundedInt(batchIdParam, 0, { min: 0, max: 2147483647 });
    if (!batchId) {
      return NextResponse.json({ ok: false, error: 'Invalid batch_id' }, { status: 400 });
    }

    const row = serializeBatchRow(await getBatchById(batchId));
    if (!row) {
      return NextResponse.json({ ok: false, error: 'Batch not found' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      row,
      migration,
      queue: {
        concurrency: WORKER_CONCURRENCY,
        active: activeWorkers,
        pending: pendingJobs.length,
      },
    });
  }

  const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM tb_scanlog_safe_batches`);

  const total = Number(rows?.[0]?.total ?? 0);
  const { limit, pageInput } = parsePaginationParams(url.searchParams, {
    defaultLimit: 30,
    maxLimit: 200,
  });
  const meta = computePaginationMeta({ total, pageInput, limit });

  const [pagedRows] = await pool.query(
    `
      SELECT id, source_sdk, sn, requested_from, requested_to, status,
             pulled_count, inserted_count, error_message, created_at, finished_at
      FROM tb_scanlog_safe_batches
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `,
    [meta.limit, meta.offset]
  );

  return NextResponse.json(
    buildPaginatedResponse({
      items: pagedRows.map(serializeBatchRow),
      total,
      pageInput,
      limit: meta.limit,
      itemKey: 'rows',
      extra: {
        migration,
        queue: {
          concurrency: WORKER_CONCURRENCY,
          active: activeWorkers,
          pending: pendingJobs.length,
        },
      },
    })
  );
}

async function runSyncBatch({ batchId, from, to, source, mode, limit, page, maxPages }) {
  const sdkPull = await pullScanlogsFromSdk({
    from,
    to,
    source,
    mode,
    limit,
    page,
    maxPages,
  });

  const insertedCount = await insertSafeEvents(sdkPull.rows, batchId);
  const mergedLegacyCount = await mergeSafeEventsIntoLegacy({ batchId, from, to });
  await closeBatch(batchId, {
    status: 'success',
    pulledCount: sdkPull.rows.length,
    insertedCount,
  });

  return {
    source: sdkPull.source,
    pulledCount: sdkPull.rows.length,
    insertedCount,
    skippedCount: Math.max(0, sdkPull.rows.length - insertedCount),
    mergedLegacyCount,
  };
}

function enqueueSyncJob(params, { markRunning = false } = {}) {
  const { batchId, from, to, source, mode, limit, page, maxPages } = params;
  upsertBatchDetail(batchId, {
    status: markRunning ? 'queued' : 'running',
    request: {
      from,
      to,
      source,
      mode,
      limit,
      page,
      max_pages: maxPages,
    },
    queuedAt: new Date().toISOString(),
  });

  pendingJobs.push({ params, markRunning });
  void pumpQueue();
}

async function pumpQueue() {
  if (queuePumping) return;
  queuePumping = true;

  try {
    while (activeWorkers < WORKER_CONCURRENCY && pendingJobs.length > 0) {
      const job = pendingJobs.shift();
      if (!job) continue;

      activeWorkers += 1;

      (async () => {
        const {
          params: { batchId },
          markRunning,
        } = job;

        try {
          if (markRunning) {
            await markBatchRunning(batchId);
            upsertBatchDetail(batchId, { status: 'running', startedAt: new Date().toISOString() });
          } else {
            upsertBatchDetail(batchId, { startedAt: new Date().toISOString(), status: 'running' });
          }
          const result = await runSyncBatch(job.params);
          upsertBatchDetail(batchId, {
            status: 'success',
            result,
            finishedAt: new Date().toISOString(),
          });
        } catch (error) {
          await closeBatch(batchId, {
            status: 'failed',
            pulledCount: 0,
            insertedCount: 0,
            errorMessage: error instanceof Error ? error.message : String(error),
          });
          upsertBatchDetail(batchId, {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            finishedAt: new Date().toISOString(),
          });
        } finally {
          activeWorkers -= 1;
          void pumpQueue();
        }
      })();
    }
  } finally {
    queuePumping = false;
  }
}

export async function POST(req) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin) return forbiddenResponse('Admin only');

  const hasEvents = await tableExists('tb_scanlog_safe_events');
  const hasBatches = await tableExists('tb_scanlog_safe_batches');
  if (!hasEvents || !hasBatches) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Safe scanlog tables not found. Run migration_scanlog_safe_events.sql first.',
      },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const action = String((body?.action || '').trim()).toLowerCase();

  if (action === 'replay_delta') {
    const migration = getMigrationGateStatus({ viewerIsAdmin: auth.is_admin });
    const replayFrom = body?.from || null;
    const replayTo = body?.to || null;
    if (!replayFrom && !replayTo) {
      return NextResponse.json(
        { ok: false, error: 'Replay requires at least one of from/to to scope delta.' },
        { status: 400 }
      );
    }

    const beforeReport = await buildDeltaReport({ safeExists: true });
    const deltaBefore = extractDeltaTotal(beforeReport, 'safe_not_in_legacy');
    const mergedCount = await mergeSafeEventsIntoLegacy({ from: replayFrom, to: replayTo });
    const afterReport = await buildDeltaReport({ safeExists: true });
    const deltaAfter = extractDeltaTotal(afterReport, 'safe_not_in_legacy');

    return NextResponse.json({
      ok: true,
      action: 'replay_delta',
      migration,
      merged_count: mergedCount,
      delta_before: deltaBefore,
      delta_after: deltaAfter,
      range: { from: replayFrom, to: replayTo },
    });
  }

  if (action === 'check_gate') {
    const migration = getMigrationGateStatus({ viewerIsAdmin: auth.is_admin });
    const threshold = Number(body?.threshold ?? 0);
    const report = await buildDeltaReport({ safeExists: true });
    const unresolved = extractDeltaTotal(report, 'safe_not_in_legacy') ?? 0;
    const blocked = unresolved > threshold;
    const payload = {
      ok: !blocked,
      blocked,
      reason_code: blocked ? 'delta_threshold_exceeded' : 'threshold_met',
      message: blocked
        ? 'Safe vs legacy reconciliation delta exceeds configured threshold.'
        : 'Safe vs legacy delta is within the allowed threshold.',
      threshold,
      unresolved_total: unresolved,
      migration,
    };

    return NextResponse.json(payload);
  }

  const from = body?.from || null;
  const to = body?.to || null;
  const source = 'windows-sdk';
  const mode = body?.mode || 'new';
  const modeValue = String(mode || 'new').toLowerCase();
  const limit = toBoundedInt(body?.limit ?? process.env.EASYLINK_SCANLOG_LIMIT, 100, {
    min: 1,
    max: 1000,
  });
  const page = toBoundedInt(body?.page, 1, { min: 1, max: 100000 });
  const defaultMaxPages =
    modeValue === 'all'
      ? toBoundedInt(process.env.EASYLINK_SCANLOG_MAX_PAGES, 1000, { min: 1, max: 100000 })
      : toBoundedInt(process.env.EASYLINK_SCANLOG_MAX_PAGES_NEW, 3, { min: 1, max: 100000 });
  const maxPages = toBoundedInt(
    body?.max_pages ?? body?.maxPages ?? process.env.EASYLINK_SCANLOG_MAX_PAGES,
    defaultMaxPages,
    { min: 1, max: 100000 }
  );

  const asyncMode = body?.async !== false;
  const isQueued = asyncMode && (activeWorkers >= WORKER_CONCURRENCY || pendingJobs.length > 0);
  const queuePosition = isQueued ? pendingJobs.length + 1 : 0;

  const batchId = await openBatch({
    sourceSdk: source,
    sn: process.env.EASYLINK_DEVICE_SN || 'unknown',
    from,
    to,
    status: isQueued ? 'queued' : 'running',
  });

  if (asyncMode) {
    enqueueSyncJob(
      { batchId, from, to, source, mode, limit, page, maxPages },
      { markRunning: isQueued }
    );

    return NextResponse.json(
      {
        ok: true,
        accepted: true,
        batch_id: batchId,
        status: isQueued ? 'queued' : 'running',
        queue: {
          position: queuePosition,
          concurrency: WORKER_CONCURRENCY,
          active: activeWorkers,
          pending: pendingJobs.length,
        },
        request: {
          mode,
          from,
          to,
          limit,
          page,
          max_pages: maxPages,
        },
      },
      { status: 202 }
    );
  }

  try {
    const result = await runSyncBatch({ batchId, from, to, source, mode, limit, page, maxPages });
    upsertBatchDetail(batchId, {
      status: 'success',
      result,
      finishedAt: new Date().toISOString(),
    });

    const batch = await getBatchById(batchId);

    return NextResponse.json({
      ok: true,
      batch_id: batchId,
      source: result.source,
      status: batch?.status || 'success',
      request: {
        mode,
        from,
        to,
        limit,
        page,
        max_pages: maxPages,
      },
      pulled_count: result.pulledCount,
      inserted_count: result.insertedCount,
      skipped_count: result.skippedCount,
      merged_legacy_count: result.mergedLegacyCount,
      row: batch,
    });
  } catch (error) {
    await closeBatch(batchId, {
      status: 'failed',
      pulledCount: 0,
      insertedCount: 0,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    upsertBatchDetail(batchId, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      finishedAt: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        ok: false,
        batch_id: batchId,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
