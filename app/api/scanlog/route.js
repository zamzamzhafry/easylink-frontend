import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import {
  getAuthContextFromCookies,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/auth-session';

const VERIFY_LABEL = {
  1: 'Fingerprint',
  20: 'Face Recognition',
  30: 'Vein Scan',
  4: 'Face',
  8: 'Palm',
  200: 'Card',
};

const IO_LABEL = {
  0: 'Check In',
  1: 'Check Out',
  2: 'Break Out',
  3: 'Break In',
  4: 'OT In',
  5: 'OT Out',
};

function normalizeLimit(raw, max = 5000) {
  const n = parseInt(raw, 10);
  if (!n || n < 1) return 500;
  return Math.min(n, max);
}

function normalizePage(raw) {
  const n = parseInt(raw, 10);
  return !n || n < 1 ? 1 : n;
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

// ─────────────────────────────────────────────
// GET /api/scanlog
// Query params: from, to, pin (filter), limit, page, source=(legacy|safe)
// Returns raw scanlog rows — NO karyawan join
// ─────────────────────────────────────────────
export async function GET(request) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin) return forbiddenResponse('Admin only');

  const { searchParams } = new URL(request.url);

  const from = searchParams.get('from') || null;
  const to = searchParams.get('to') || null;
  const pinFilter = (searchParams.get('pin') || '').trim();
  const limit = normalizeLimit(searchParams.get('limit'), 5000);
  const page = normalizePage(searchParams.get('page'));
  const offset = (page - 1) * limit;
  const download = searchParams.get('download') === '1';
  const source =
    (searchParams.get('source') || 'legacy').toLowerCase() === 'safe' ? 'safe' : 'legacy';

  const hasSafeTable = await tableExists('tb_scanlog_safe_events');
  const useSafe = source === 'safe' && hasSafeTable;
  const timeColumn = useSafe ? 'sl.scan_at' : 'sl.scan_date';
  const baseTable = useSafe ? 'tb_scanlog_safe_events' : 'tb_scanlog';

  const whereClauses = [];
  const params = [];

  if (from) {
    whereClauses.push(`DATE(${timeColumn}) >= ?`);
    params.push(from);
  }
  if (to) {
    whereClauses.push(`DATE(${timeColumn}) <= ?`);
    params.push(to);
  }
  if (pinFilter) {
    whereClauses.push('sl.pin LIKE ?');
    params.push(`%${pinFilter}%`);
  }

  const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Count query (for pagination)
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM ${baseTable} sl ${whereSQL}`,
    params
  );
  const total = Number(Array.isArray(countRows) ? (countRows[0]?.total ?? 0) : 0);

  // Data query
  const dataParams = [...params, limit, offset];
  const [rows] = await pool.query(
    `SELECT
       sl.sn,
       DATE(${timeColumn})   AS scan_date,
       TIME(${timeColumn})   AS scan_time,
       sl.pin,
       sl.verifymode,
       sl.iomode,
       sl.workcode
     FROM ${baseTable} sl
     ${whereSQL}
     ORDER BY ${timeColumn} DESC
     LIMIT ? OFFSET ?`,
    dataParams
  );

  const records = (Array.isArray(rows) ? rows : []).map((r) => ({
    sn: r.sn || '',
    scan_date: r.scan_date ? String(r.scan_date).slice(0, 10) : null,
    scan_time: r.scan_time ? String(r.scan_time).slice(0, 8) : null,
    pin: String(r.pin),
    verifymode: Number(r.verifymode ?? 0),
    verify_label: VERIFY_LABEL[Number(r.verifymode)] ?? String(r.verifymode ?? ''),
    iomode: Number(r.iomode ?? 0),
    io_label: IO_LABEL[Number(r.iomode)] ?? String(r.iomode ?? ''),
    workcode: Number(r.workcode ?? 0),
  }));

  // CSV download
  if (download) {
    const header = 'SN,Date,Time,PIN,Verify Mode,IO Mode,Work Code\n';
    const csv =
      header +
      records
        .map((r) =>
          [r.sn, r.scan_date, r.scan_time, r.pin, r.verify_label, r.io_label, r.workcode].join(',')
        )
        .join('\n');

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="scanlog_${from ?? 'all'}_${to ?? 'all'}.csv"`,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    source: useSafe ? 'safe' : 'legacy',
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    records,
  });
}
