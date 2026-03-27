import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import {
  forbiddenResponse,
  getAuthContextFromCookies,
  unauthorizedResponse,
} from '@/lib/auth-session';
import { pullScanlogsFromSdk } from '@/lib/easylink-sdk-client';

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

export async function GET(req) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin) return forbiddenResponse('Admin only');

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

  const url = new URL(req.url);
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
      queue: {
        concurrency: WORKER_CONCURRENCY,
        active: activeWorkers,
        pending: pendingJobs.length,
      },
    });
  }

  const [rows] = await pool.query(
    `
      SELECT id, source_sdk, sn, requested_from, requested_to, status,
             pulled_count, inserted_count, error_message, created_at, finished_at
      FROM tb_scanlog_safe_batches
      ORDER BY id DESC
      LIMIT 30
    `
  );

  return NextResponse.json({
    ok: true,
    rows: rows.map(serializeBatchRow),
    queue: {
      concurrency: WORKER_CONCURRENCY,
      active: activeWorkers,
      pending: pendingJobs.length,
    },
  });
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
