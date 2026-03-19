import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import {
  forbiddenResponse,
  getAuthContextFromCookies,
  unauthorizedResponse,
} from '@/lib/auth-session';
import { pullScanlogsFromSdk } from '@/lib/easylink-sdk-client';

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

async function openBatch({ sourceSdk, sn, from, to }) {
  const [result] = await pool.query(
    `
      INSERT INTO tb_scanlog_safe_batches (
        source_sdk,
        sn,
        requested_from,
        requested_to,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, 'running', NOW())
    `,
    [sourceSdk, sn, from || null, to || null]
  );
  return Number(result.insertId);
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

export async function GET() {
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

  const [rows] = await pool.query(
    `
      SELECT id, source_sdk, sn, requested_from, requested_to, status,
             pulled_count, inserted_count, error_message, created_at, finished_at
      FROM tb_scanlog_safe_batches
      ORDER BY id DESC
      LIMIT 30
    `
  );

  return NextResponse.json({ ok: true, rows });
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
  const source = body?.source || 'auto';
  const mode = body?.mode || 'new';

  const sdkPull = await pullScanlogsFromSdk({ from, to, source, mode });
  const batchId = await openBatch({
    sourceSdk: sdkPull.source,
    sn: sdkPull.rows[0]?.sn || process.env.EASYLINK_DEVICE_SN || 'unknown',
    from,
    to,
  });

  try {
    const insertedCount = await insertSafeEvents(sdkPull.rows, batchId);
    await closeBatch(batchId, {
      status: 'success',
      pulledCount: sdkPull.rows.length,
      insertedCount,
    });

    return NextResponse.json({
      ok: true,
      batch_id: batchId,
      source: sdkPull.source,
      pulled_count: sdkPull.rows.length,
      inserted_count: insertedCount,
      skipped_count: Math.max(0, sdkPull.rows.length - insertedCount),
    });
  } catch (error) {
    await closeBatch(batchId, {
      status: 'failed',
      pulledCount: sdkPull.rows.length,
      insertedCount: 0,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
