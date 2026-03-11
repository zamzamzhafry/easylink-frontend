import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import {
  getAuthContextFromCookies,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/auth-session';

const VERIFY_LABEL = {
  1: 'Finger',
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

// ─────────────────────────────────────────────
// GET /api/scanlog
// Query params: from, to, pin (filter), limit, page
// Returns raw tb_scanlog rows — NO karyawan join
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

  const whereClauses = [];
  const params = [];

  if (from) {
    whereClauses.push('DATE(sl.scan_date) >= ?');
    params.push(from);
  }
  if (to) {
    whereClauses.push('DATE(sl.scan_date) <= ?');
    params.push(to);
  }
  if (pinFilter) {
    whereClauses.push('sl.pin LIKE ?');
    params.push(`%${pinFilter}%`);
  }

  const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Count query (for pagination)
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM tb_scanlog sl ${whereSQL}`,
    params
  );
  const total = Number(Array.isArray(countRows) ? (countRows[0]?.total ?? 0) : 0);

  // Data query
  const dataParams = [...params, limit, offset];
  const [rows] = await pool.query(
    `SELECT
       sl.sn,
       DATE(sl.scan_date)    AS scan_date,
       TIME(sl.scan_date)    AS scan_time,
       sl.pin,
       sl.verifymode,
       sl.iomode,
       sl.workcode
     FROM tb_scanlog sl
     ${whereSQL}
     ORDER BY sl.scan_date DESC
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
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    records,
  });
}
