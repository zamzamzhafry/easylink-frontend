export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { hasKaryawanColumn } from '@/lib/karyawan-schema';
import {
  getAuthContextFromCookies,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/auth-session';
import {
  buildPaginatedResponse,
  computePaginationMeta,
  parsePaginationParams,
} from '@/lib/pagination';
import { canAccessRawAttendance } from '@/lib/authz/authorization-adapter';

function nextIsoDate(dateString) {
  const date = new Date(`${String(dateString)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export async function GET(req) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!canAccessRawAttendance(auth)) return forbiddenResponse('Admin only.');

  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get('from') || new Date().toISOString().slice(0, 10);
  const dateTo = searchParams.get('to') || dateFrom;
  const groupId = searchParams.get('group_id') || null;
  const employeeIdParam = searchParams.get('employee_id') || null;
  const pinFilter = (searchParams.get('pin') || '').trim();
  const parsedGroupId = Number.parseInt(groupId ?? '', 10);
  const parsedEmployeeId = Number.parseInt(employeeIdParam ?? '', 10);
  const { limit, pageInput } = parsePaginationParams(searchParams, {
    defaultLimit: 500,
    maxLimit: 5000,
  });
  const canFilterDeleted = await hasKaryawanColumn('isDeleted');

  const fromWhereSql = `
    FROM tb_scanlog sl
    LEFT JOIN tb_karyawan       k  ON k.pin = sl.pin ${canFilterDeleted ? 'AND k.isDeleted = 0' : ''}
    LEFT JOIN tb_user           u  ON u.pin = sl.pin
    LEFT JOIN (
      SELECT karyawan_id, MIN(group_id) AS group_id
      FROM tb_employee_group
      GROUP BY karyawan_id
    ) eg ON eg.karyawan_id = k.id
    LEFT JOIN tb_group          g  ON g.id = eg.group_id
    LEFT JOIN tb_attendance_note an ON an.pin = sl.pin AND an.tanggal = DATE(sl.scan_date)
    WHERE sl.scan_date >= ? AND sl.scan_date < ?
  `;

  const params = [`${dateFrom} 00:00:00`, `${nextIsoDate(dateTo)} 00:00:00`];
  const extraClauses = [];

  if (Number.isInteger(parsedGroupId)) {
    extraClauses.push(
      'EXISTS (SELECT 1 FROM tb_employee_group egf WHERE egf.karyawan_id = k.id AND egf.group_id = ?)'
    );
    params.push(parsedGroupId);
  }

  if (Number.isInteger(parsedEmployeeId)) {
    extraClauses.push('k.id = ?');
    params.push(parsedEmployeeId);
  }

  if (pinFilter) {
    extraClauses.push('sl.pin LIKE ?');
    params.push(`%${pinFilter}%`);
  }

  const extraWhere = extraClauses.length ? ` AND ${extraClauses.join(' AND ')}` : '';

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
     ${fromWhereSql}
     ${extraWhere}`,
    params
  );

  const total = Number(countRows?.[0]?.total ?? 0);
  const meta = computePaginationMeta({ total, pageInput, limit });

  const query = `
    SELECT
      DATE(sl.scan_date) AS scan_date,
      TIME(sl.scan_date) AS scan_time,
      sl.pin,
      k.id AS karyawan_id,
      COALESCE(k.nama, u.nama, sl.pin) AS nama,
      eg.group_id,
      g.nama_group,
      sl.verifymode,
      sl.iomode,
      sl.workcode,
      an.status AS note_status,
      an.catatan AS note_catatan,
      CASE
        WHEN an.status IS NOT NULL OR (an.catatan IS NOT NULL AND TRIM(an.catatan) <> '') THEN 'reviewed'
        ELSE 'pending'
      END AS reviewed_status
    ${fromWhereSql}
    ${extraWhere}
    ORDER BY sl.scan_date DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query(query, [...params, meta.limit, meta.offset]);

  return NextResponse.json(
    buildPaginatedResponse({
      items: rows,
      total,
      pageInput,
      limit: meta.limit,
      itemKey: 'rows',
    })
  );
}
