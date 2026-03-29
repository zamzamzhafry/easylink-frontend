export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { hasKaryawanColumn } from '@/lib/karyawan-schema';
import {
  forbiddenResponse,
  getAuthContextFromCookies,
  unauthorizedResponse,
} from '@/lib/auth-session';
import {
  canAccessAttendance,
  canAccessRawAttendance,
  getAttendanceGroupIds,
} from '@/lib/authz/authorization-adapter';

const tableExistsCache = new Map();

async function hasTable(tableName) {
  if (tableExistsCache.has(tableName)) return tableExistsCache.get(tableName) === true;
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
     LIMIT 1`,
    [tableName]
  );
  const exists = Array.isArray(rows) && rows.length > 0;
  tableExistsCache.set(tableName, exists);
  return exists;
}

function toMinutes(timeValue) {
  if (!timeValue) return null;
  const [hh = '0', mm = '0'] = String(timeValue).split(':');
  const h = Number.parseInt(hh, 10);
  const m = Number.parseInt(mm, 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function buildStatus({ firstScan, lastScan, shiftIn, shiftOut, nextDay, scanCount }) {
  if (!firstScan || !lastScan) return 'tidak_hadir';
  const inM = toMinutes(firstScan);
  const outM = toMinutes(lastScan);
  const shiftInM = toMinutes(shiftIn);
  let shiftOutM = toMinutes(shiftOut);

  let status = 'normal';
  if (shiftInM != null && inM != null && inM - shiftInM > 15) status = 'terlambat';

  if (shiftOutM != null && outM != null) {
    if (nextDay && shiftOutM < 12 * 60) shiftOutM += 24 * 60;
    const adjustedOut = nextDay && outM < 12 * 60 ? outM + 24 * 60 : outM;
    if (status === 'normal' && shiftOutM - adjustedOut > 15) status = 'pulang_awal';
  }

  if (Number(scanCount || 0) > 2 && status === 'normal') status = 'double_punch';
  return status;
}

async function ensureReviewTagTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tb_scanlog_review_tag (
      pin VARCHAR(32) NOT NULL,
      scan_at DATETIME NOT NULL,
      sn VARCHAR(64) NOT NULL,
      iomode INT NOT NULL,
      workcode INT NOT NULL,
      status ENUM('late','acceptable','invalid') NOT NULL,
      note VARCHAR(255),
      tagged_by VARCHAR(32) NOT NULL,
      tagged_at DATETIME NOT NULL,
      PRIMARY KEY (pin, scan_at, sn, iomode, workcode)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function ensureReviewMutationAuditTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tb_scanlog_review_mutation_audit (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      action VARCHAR(32) NOT NULL,
      pin VARCHAR(32) NOT NULL,
      scan_at DATETIME NOT NULL,
      sn VARCHAR(64) NOT NULL,
      iomode INT NOT NULL,
      workcode INT NOT NULL,
      tag_status ENUM('late','acceptable','invalid') DEFAULT NULL,
      note VARCHAR(255) DEFAULT NULL,
      reason VARCHAR(255) DEFAULT NULL,
      actor_pin VARCHAR(32) NOT NULL,
      acted_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      KEY idx_review_mutation_lookup (pin, scan_at, sn, iomode, workcode),
      KEY idx_review_mutation_action_time (action, acted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function appendReviewMutationAudit({
  action,
  pin,
  scanAt,
  sn,
  iomode,
  workcode,
  status,
  note,
  reason,
  actorPin,
}) {
  await ensureReviewMutationAuditTable();
  await pool.query(
    `INSERT INTO tb_scanlog_review_mutation_audit
       (action, pin, scan_at, sn, iomode, workcode, tag_status, note, reason, actor_pin, acted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      action,
      pin,
      scanAt,
      sn,
      iomode,
      workcode,
      status || null,
      note || null,
      reason || null,
      actorPin,
    ]
  );
}

const TAXONOMY_STATUSES = new Set(['late', 'acceptable', 'invalid']);

export async function GET(req) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();

  if (!canAccessAttendance(auth)) return forbiddenResponse('No attendance review access.');

  const canFilterDeleted = await hasKaryawanColumn('isDeleted');
  const hasHiddenTable = await hasTable('tb_scanlog_hidden');

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') || new Date().toISOString().slice(0, 10);
  const to = searchParams.get('to') || from;
  const groupId = searchParams.get('group_id') || '';
  const pinFilter = searchParams.get('pin') || '';

  const allowedGroups = getAttendanceGroupIds(auth);
  const accessibleGroupIds = Array.isArray(allowedGroups) ? allowedGroups : [];

  const where = ['DATE(sl.scan_date) BETWEEN ? AND ?'];
  const params = [from, to];

  if (pinFilter) {
    where.push('sl.pin = ?');
    params.push(pinFilter);
  }

  if (groupId) {
    where.push('eg.group_id = ?');
    params.push(Number(groupId));
  }

  if (!auth.is_admin) {
    if (!accessibleGroupIds.length) {
      return NextResponse.json({ rows: [], has_hidden_table: hasHiddenTable });
    }
    where.push(`eg.group_id IN (${accessibleGroupIds.map(() => '?').join(',')})`);
    params.push(...accessibleGroupIds);
  }

  if (canFilterDeleted) where.push('COALESCE(k.isDeleted, 0) = 0');

  const hiddenJoin = hasHiddenTable
    ? `LEFT JOIN tb_scanlog_hidden sh
         ON sh.pin = sl.pin
        AND sh.scan_at = sl.scan_date
        AND COALESCE(sh.sn, '') = COALESCE(sl.sn, '')
        AND sh.iomode = sl.iomode
        AND sh.workcode = sl.workcode
        AND sh.is_active = 1`
    : 'LEFT JOIN (SELECT NULL AS id) sh ON 1=0';

  const [punches] = await pool.query(
    `SELECT
       sl.pin,
       DATE(sl.scan_date) AS scan_date,
       TIME(sl.scan_date) AS scan_time,
       sl.scan_date AS scan_at,
       sl.sn,
       sl.verifymode,
       sl.iomode,
       sl.workcode,
       CASE WHEN sh.id IS NULL THEN 0 ELSE 1 END AS is_hidden,
       k.id AS karyawan_id,
       COALESCE(k.nama, u.nama, sl.pin) AS nama,
       eg.group_id,
       g.nama_group,
       st.nama_shift,
       st.jam_masuk,
       st.jam_keluar,
       st.next_day,
       st.color_hex,
       st.icon_key
     FROM tb_scanlog sl
     LEFT JOIN tb_karyawan k ON k.pin = sl.pin
     LEFT JOIN tb_user u ON u.pin = sl.pin
     LEFT JOIN tb_employee_group eg ON eg.karyawan_id = k.id
     LEFT JOIN tb_group g ON g.id = eg.group_id
     LEFT JOIN tb_schedule sc ON sc.karyawan_id = k.id AND sc.tanggal = DATE(sl.scan_date)
     LEFT JOIN tb_shift_type st ON st.id = sc.shift_id
     ${hiddenJoin}
     WHERE ${where.join(' AND ')}
     ORDER BY sl.scan_date DESC, sl.pin ASC, sl.scan_date ASC`,
    params
  );

  const grouped = new Map();
  for (const punch of Array.isArray(punches) ? punches : []) {
    const key = `${punch.pin}|${punch.scan_date}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        pin: punch.pin,
        scan_date: punch.scan_date,
        nama: punch.nama,
        karyawan_id: punch.karyawan_id != null ? Number(punch.karyawan_id) : null,
        group_id: punch.group_id != null ? Number(punch.group_id) : null,
        nama_group: punch.nama_group || null,
        nama_shift: punch.nama_shift || null,
        jam_masuk: punch.jam_masuk || null,
        jam_keluar: punch.jam_keluar || null,
        next_day: Number(punch.next_day ?? 0) === 1,
        color_hex: punch.color_hex || null,
        icon_key: punch.icon_key || null,
        visible_times: [],
        hidden_count: 0,
        scan_count: 0,
        punches: [],
      });
    }
    const bucket = grouped.get(key);
    bucket.scan_count += 1;
    const isHidden = Number(punch.is_hidden) === 1;
    if (isHidden) bucket.hidden_count += 1;
    if (!isHidden) bucket.visible_times.push(String(punch.scan_time).slice(0, 8));
    bucket.punches.push({
      scan_at: punch.scan_at,
      scan_time: String(punch.scan_time).slice(0, 8),
      sn: punch.sn,
      verifymode: punch.verifymode,
      iomode: punch.iomode,
      workcode: punch.workcode,
      is_hidden: isHidden,
    });
  }

  const rows = Array.from(grouped.values()).map((row) => {
    const sortedTimes = [...row.visible_times].sort();
    const firstScan = sortedTimes[0] || null;
    const lastScan = sortedTimes[sortedTimes.length - 1] || null;
    return {
      ...row,
      visible_times: sortedTimes,
      first_scan: firstScan,
      last_scan: lastScan,
      computed_status: buildStatus({
        firstScan,
        lastScan,
        shiftIn: row.jam_masuk,
        shiftOut: row.jam_keluar,
        nextDay: row.next_day,
        scanCount: sortedTimes.length,
      }),
    };
  });

  return NextResponse.json({ rows, has_hidden_table: hasHiddenTable });
}

export async function POST(req) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!canAccessRawAttendance(auth)) return forbiddenResponse('Admin only.');

  const body = await req.json();
  const action = body?.action;
  const pin = String(body?.pin || '').trim();
  const scanAt = body?.scan_at;
  const sn = String(body?.sn ?? '');
  const iomode = Number(body?.iomode ?? 0);
  const workcode = Number(body?.workcode ?? 0);
  const reason = body?.reason ? String(body.reason).slice(0, 255) : null;

  if (!pin || !scanAt) {
    return NextResponse.json(
      { ok: false, error: 'pin and scan_at are required.' },
      { status: 400 }
    );
  }

  if (action === 'hide') {
    const hasHiddenTable = await hasTable('tb_scanlog_hidden');
    if (!hasHiddenTable) {
      return NextResponse.json(
        {
          ok: false,
          error: 'tb_scanlog_hidden does not exist. Run migration_scanlog_hidden.sql first.',
        },
        { status: 400 }
      );
    }
    await pool.query(
      `INSERT INTO tb_scanlog_hidden (pin, scan_at, sn, iomode, workcode, reason, hidden_by, is_active, hidden_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW())
       ON DUPLICATE KEY UPDATE
         reason = VALUES(reason),
         hidden_by = VALUES(hidden_by),
         is_active = 1,
         hidden_at = NOW()`,
      [pin, scanAt, sn, iomode, workcode, reason, auth.pin]
    );
    await appendReviewMutationAudit({
      action,
      pin,
      scanAt,
      sn,
      iomode,
      workcode,
      reason,
      actorPin: auth.pin,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === 'unhide') {
    const hasHiddenTable = await hasTable('tb_scanlog_hidden');
    if (!hasHiddenTable) {
      return NextResponse.json(
        {
          ok: false,
          error: 'tb_scanlog_hidden does not exist. Run migration_scanlog_hidden.sql first.',
        },
        { status: 400 }
      );
    }
    await pool.query(
      `UPDATE tb_scanlog_hidden
       SET is_active = 0,
           hidden_by = ?,
           hidden_at = NOW()
       WHERE pin = ?
         AND scan_at = ?
         AND COALESCE(sn, '') = COALESCE(?, '')
         AND iomode = ?
         AND workcode = ?`,
      [auth.pin, pin, scanAt, sn, iomode, workcode]
    );
    await appendReviewMutationAudit({
      action,
      pin,
      scanAt,
      sn,
      iomode,
      workcode,
      reason,
      actorPin: auth.pin,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === 'tag') {
    const statusInput = String(body?.status || '')
      .trim()
      .toLowerCase();
    if (!TAXONOMY_STATUSES.has(statusInput)) {
      return NextResponse.json({ ok: false, error: 'Invalid taxonomy status.' }, { status: 400 });
    }
    const note = body?.note ? String(body.note).slice(0, 255) : null;
    await ensureReviewTagTable();
    await pool.query(
      `INSERT INTO tb_scanlog_review_tag
         (pin, scan_at, sn, iomode, workcode, status, note, tagged_by, tagged_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         note = VALUES(note),
         tagged_by = VALUES(tagged_by),
         tagged_at = NOW()`,
      [pin, scanAt, sn, iomode, workcode, statusInput, note, auth.pin]
    );
    await appendReviewMutationAudit({
      action,
      pin,
      scanAt,
      sn,
      iomode,
      workcode,
      status: statusInput,
      note,
      reason,
      actorPin: auth.pin,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 });
}
