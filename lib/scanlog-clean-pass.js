// Scanlog clean pass (Option A) — app owns transform/dedup/validate.
//
// The fetcher lands raw device rows verbatim in tb_raw_scanlog. This module
// reads pending rows, transforms each device row into a HOP_B record (ported
// 1:1 from the fetcher's lib/transform.php), validates it against the shared
// contract, detects invalid dates, and writes survivors to
// tb_scanlog_safe_events via the existing INSERT IGNORE writer.
//
// Raw rows are marked 'clean' or 'invalid' — never deleted. Re-running is safe:
// safe_events dedups on source_event_key, so a re-clean is idempotent.

import pool from './db.js';
import { buildHopBSourceEventKey } from './hop-b-ingest-contract.js';
import { insertHopBSafeEvents } from './hop-b-ingest-writer.js';

const CLEAN_PASS_SOURCE_SDK = 'fetcher-pull';

function toInt(value) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
}

// Real calendar validity — catches "2026-02-30" style garbage that a pure
// regex/length check (the php8 sample only did strlen < 19) would let through.
function isValidCalendarDate(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (!/^\d{2}:\d{2}:\d{2}$/.test(time)) return false;
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi, s] = time.split(':').map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  if (h > 23 || mi > 59 || s > 59) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

// Landing dedup key — loose, guards against re-pulling the same window. The
// clean pass owns canonical dedup (safe_events source_event_key).
function buildNaturalKey(row, deviceSn) {
  return [deviceSn, String(row?.ScanDate ?? ''), String(row?.PIN ?? ''), String(row?.IOMode ?? '')].join('|');
}

/**
 * Land raw device rows verbatim into tb_raw_scanlog. INSERT IGNORE on natural_key
 * so re-pulling the same window is a no-op. Rows start process_status='pending'.
 *
 * @param {{deviceSn:string, rawRows:object[]}} args
 * @returns {Promise<{landed:number, duplicate:number}>}
 */
export async function landRawRows({ deviceSn, rawRows }) {
  if (!rawRows.length) return { landed: 0, duplicate: 0 };

  const placeholders = rawRows.map(() => '(?, ?, ?)').join(', ');
  const params = rawRows.flatMap((row) => [
    deviceSn,
    buildNaturalKey(row, deviceSn),
    JSON.stringify(row),
  ]);

  const [result] = await pool.query(
    `INSERT IGNORE INTO tb_raw_scanlog (device_sn, natural_key, raw_json) VALUES ${placeholders}`,
    params
  );
  const landed = Number(result.affectedRows || 0);
  return { landed, duplicate: rawRows.length - landed };
}

/**
 * Transform one raw device row -> { record } or { error }.
 * Device row: {PIN, WorkCode, SN, VerifyMode, ScanDate:"YYYY-MM-DD HH:MM:SS", IOMode}
 * Ported from fetcher lib/transform.php transform_device_row().
 */
export function cleanDeviceRow(row, deviceSn) {
  const pin = String(row?.PIN ?? '').trim();
  const scanDate = String(row?.ScanDate ?? '').trim();

  if (!pin) return { record: null, error: 'missing PIN' };
  if (scanDate.length < 19) return { record: null, error: 'missing/short ScanDate' };

  const date = scanDate.slice(0, 10);
  const time = scanDate.slice(11, 19);

  if (!isValidCalendarDate(date, time)) {
    return { record: null, error: `invalid date/time: ${scanDate}` };
  }

  const record = {
    device_sn: deviceSn,
    scan_date: date,
    scan_time: time,
    pin,
    verify_mode: toInt(row?.VerifyMode),
    io_mode: toInt(row?.IOMode),
    workcode: toInt(row?.WorkCode),
  };
  record.source_event_key = buildHopBSourceEventKey(record);
  record.source_sdk = CLEAN_PASS_SOURCE_SDK;

  return { record, error: null };
}

/**
 * Process pending tb_raw_scanlog rows: transform, validate, write survivors to
 * safe_events, mark each raw row clean/invalid. Idempotent.
 *
 * @param {{limit?:number}} opts
 * @returns {Promise<{scanned:number, inserted:number, duplicate:number, invalid:number}>}
 */
export async function runCleanPass({ limit = 5000 } = {}) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT id, device_sn, raw_json FROM tb_raw_scanlog
       WHERE process_status = 'pending'
       ORDER BY id ASC
       LIMIT ?`,
      [limit]
    );
    if (rows.length === 0) {
      return { scanned: 0, inserted: 0, duplicate: 0, invalid: 0 };
    }

    const cleanIds = [];
    const records = [];
    const invalid = []; // { id, error }

    for (const r of rows) {
      const raw = typeof r.raw_json === 'string' ? JSON.parse(r.raw_json) : r.raw_json;
      const { record, error } = cleanDeviceRow(raw, r.device_sn);
      if (record) {
        records.push(record);
        cleanIds.push(r.id);
      } else {
        invalid.push({ id: r.id, error });
      }
    }

    await conn.beginTransaction();

    let inserted = 0;
    if (records.length > 0) {
      const batchId = `cleanpass-${Date.now()}`;
      inserted = await insertHopBSafeEvents(conn, { ingestLogId: batchId, records });
    }

    if (cleanIds.length > 0) {
      await conn.query(
        `UPDATE tb_raw_scanlog SET process_status='clean', processed_at=NOW()
         WHERE id IN (?)`,
        [cleanIds]
      );
    }
    for (const { id, error } of invalid) {
      await conn.query(
        `UPDATE tb_raw_scanlog SET process_status='invalid', process_error=?, processed_at=NOW()
         WHERE id = ?`,
        [error.slice(0, 255), id]
      );
    }

    await conn.commit();

    return {
      scanned: rows.length,
      inserted,
      duplicate: records.length - inserted,
      invalid: invalid.length,
    };
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally {
    conn.release();
  }
}
