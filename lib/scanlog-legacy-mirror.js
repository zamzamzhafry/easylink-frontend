import pool from './db.js';

/**
 * Shared safe-events -> legacy tb_scanlog mirror.
 *
 * Two ingest paths feed `tb_scanlog_safe_events` (canonical):
 *   1. Legacy SDK pull   -> /api/scanlog/sync
 *   2. HOP B push ingest -> /api/scanlog/hop-b-ingest
 *
 * All page-facing read APIs (attendance, analytics, dashboard SSR,
 * employees, performance, report, schedule, users, etc.) still read
 * `tb_scanlog`. Without this mirror, consumers go silently empty when
 * production runs on HOP B push.
 *
 * Selection logic:
 *   - Range mode  ({from, to}): matches by DATE(scan_at) - safe for any writer.
 *   - Batch mode  ({batchId}) : only effective when the writer actually
 *                                populates `tb_scanlog_safe_events.batch_id`.
 *
 * NOTE: legacy `tb_scanlog.scan_date` is a DATETIME column holding the
 * full timestamp (date + time). We intentionally write `se.scan_at` into
 * it to preserve time-of-day precision for downstream consumers.
 */

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

export async function mergeSafeEventsIntoLegacy({ batchId, from, to } = {}) {
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
