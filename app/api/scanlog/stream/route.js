import {
  forbiddenResponse,
  getAuthContextFromCookies,
  unauthorizedResponse,
} from '@/lib/auth-session';
import pool from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WORKER_CONCURRENCY = Math.min(
  4,
  Math.max(1, Number.parseInt(process.env.EASYLINK_SCANLOG_WORKERS || '1', 10) || 1)
);

function toBoundedInt(value, fallback, { min = 1, max = 100 } = {}) {
  const numeric = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

async function tableExists(name) {
  const [rows] = await pool.query(
    `SELECT 1 AS found
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
     LIMIT 1`,
    [name]
  );
  return Array.isArray(rows) && rows.length > 0;
}

function normalizeRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: Number(row.id || 0),
    source_sdk: row.source_sdk || 'windows-sdk',
    sn: row.sn || '',
    requested_from: row.requested_from || null,
    requested_to: row.requested_to || null,
    status: row.status || 'queued',
    pulled_count: Number(row.pulled_count || 0),
    inserted_count: Number(row.inserted_count || 0),
    error_message: row.error_message || '',
    created_at: row.created_at || null,
    started_at: row.started_at || null,
    finished_at: row.finished_at || null,
  };
}

async function getScanlogQueueSnapshot(limit) {
  const [rowsRaw] = await pool.query(
    `SELECT id,
            source_sdk,
            sn,
            requested_from,
            requested_to,
            status,
            pulled_count,
            inserted_count,
            error_message,
            created_at,
            started_at,
            finished_at
     FROM tb_scanlog_safe_batches
     ORDER BY id DESC
     LIMIT ?`,
    [limit]
  );

  const [statusRows] = await pool.query(
    `SELECT status, COUNT(*) AS total
     FROM tb_scanlog_safe_batches
     WHERE status IN ('queued', 'running')
     GROUP BY status`
  );

  let active = 0;
  let pending = 0;
  for (const row of Array.isArray(statusRows) ? statusRows : []) {
    const status = String(row.status || '').toLowerCase();
    if (status === 'running') active += Number(row.total || 0);
    if (status === 'queued') pending += Number(row.total || 0);
  }

  return {
    queue: {
      concurrency: WORKER_CONCURRENCY,
      active,
      pending,
    },
    rows: (Array.isArray(rowsRaw) ? rowsRaw : []).map(normalizeRow).filter(Boolean),
  };
}

function buildFingerprint(snapshot) {
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  const rowHash = rows
    .map((row) => `${row.id}:${row.status}:${row.pulled_count}:${row.inserted_count}`)
    .join('|');
  const queue = snapshot?.queue || {};
  return `${queue.active || 0}:${queue.pending || 0}:${rowHash}`;
}

function sse(event, payload) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(request) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin) return forbiddenResponse('Admin only');

  const hasBatchTable = await tableExists('tb_scanlog_safe_batches');
  if (!hasBatchTable) {
    return new Response(sse('error', { ok: false, message: 'scanlog safe tables not found' }), {
      status: 409,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  }

  const { searchParams } = new URL(request.url);
  const limit = toBoundedInt(searchParams.get('limit'), 10, { min: 1, max: 50 });
  const intervalMs = toBoundedInt(searchParams.get('interval_ms'), 5000, {
    min: 1000,
    max: 30000,
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let intervalId = null;
      let lastFingerprint = '';

      const closeStream = () => {
        if (closed) return;
        closed = true;
        if (intervalId) clearInterval(intervalId);
        try {
          controller.close();
        } catch {
          // stream already closed
        }
      };

      const emitSnapshot = async () => {
        if (closed) return;
        try {
          const snapshot = await getScanlogQueueSnapshot(limit);
          const fingerprint = buildFingerprint(snapshot);
          const ts = new Date().toISOString();

          if (fingerprint !== lastFingerprint) {
            lastFingerprint = fingerprint;
            controller.enqueue(
              encoder.encode(
                sse('queue', {
                  ok: true,
                  ts,
                  ...snapshot,
                })
              )
            );
            return;
          }

          controller.enqueue(encoder.encode(sse('heartbeat', { ok: true, ts })));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'failed to stream queue';
          controller.enqueue(encoder.encode(sse('error', { ok: false, message })));
        }
      };

      controller.enqueue(encoder.encode('retry: 5000\n\n'));

      void emitSnapshot();
      intervalId = setInterval(() => {
        void emitSnapshot();
      }, intervalMs);

      request.signal.addEventListener('abort', closeStream);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
