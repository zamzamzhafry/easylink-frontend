export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { hasKaryawanColumn } from '@/lib/karyawan-schema';
import {
  getAuthContextFromCookies,
  unauthorizedResponse,
} from '@/lib/auth-session';
import {
  canAccessAttendance,
  getAttendanceGroupIds,
} from '@/lib/authz/authorization-adapter';

function invalid(message) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

function buildInPlaceholders(values) {
  return values.map(() => '?').join(',');
}

function toIsoDate(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
}

function buildDateRange(from, to) {
  const dates = [];
  const current = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

async function ensureScheduleView() {
  const auth = await getAuthContextFromCookies();
  if (!auth) return { error: unauthorizedResponse('Login required.') };
  if (!canAccessAttendance(auth)) {
    return {
      error: NextResponse.json({ ok: false, error: 'You do not have schedule permission.' }, { status: 403 }),
    };
  }
  return {
    auth,
    allowedGroupIds: getAttendanceGroupIds(auth),
  };
}

export async function GET(req) {
  const authCheck = await ensureScheduleView();
  if (authCheck.error) return authCheck.error;

  const { auth, allowedGroupIds } = authCheck;
  const { searchParams } = new URL(req.url);
  const from = toIsoDate(searchParams.get('from'));
  const to = toIsoDate(searchParams.get('to'));
  const groupParam = searchParams.get('group_id');
  const groupId = Number.parseInt(groupParam ?? '', 10);
  const canFilterDeleted = await hasKaryawanColumn('isDeleted');

  if (!from || !to) return invalid('from and to are required.');
  if (from > to) return invalid('from must be earlier than or equal to to.');

  if (!auth.is_admin && Number.isInteger(groupId) && !allowedGroupIds?.includes(groupId)) {
    return NextResponse.json(
      { ok: false, error: 'This group is not approved for your schedule access.' },
      { status: 403 }
    );
  }

  if (!auth.is_admin && allowedGroupIds && allowedGroupIds.length === 0) {
    return NextResponse.json({ from, to, dates: buildDateRange(from, to), rows: [] });
  }

  const employeeFilters = [];
  const employeeParams = [];

  if (Number.isInteger(groupId)) {
    employeeFilters.push(
      'EXISTS (SELECT 1 FROM tb_employee_group egf WHERE egf.karyawan_id = k.id AND egf.group_id = ?)'
    );
    employeeParams.push(groupId);
  }

  if (!auth.is_admin && allowedGroupIds) {
    employeeFilters.push(
      `EXISTS (SELECT 1 FROM tb_employee_group ega WHERE ega.karyawan_id = k.id AND ega.group_id IN (${buildInPlaceholders(
        allowedGroupIds
      )}))`
    );
    employeeParams.push(...allowedGroupIds);
  }

  const employeeWhere = [
    '1 = 1',
    canFilterDeleted ? 'k.isDeleted = 0' : null,
    ...employeeFilters,
  ]
    .filter(Boolean)
    .join(' AND ');

  const [employeeRowsRaw] = await pool.query(
    `
      SELECT
        k.id,
        COALESCE(k.nama, u.nama, k.pin) AS nama,
        k.pin,
        eg.group_id,
        g.nama_group
      FROM tb_karyawan k
      LEFT JOIN tb_user u ON u.pin = k.pin
      LEFT JOIN (
        SELECT karyawan_id, MIN(group_id) AS group_id
        FROM tb_employee_group
        GROUP BY karyawan_id
      ) eg ON eg.karyawan_id = k.id
      LEFT JOIN tb_group g ON g.id = eg.group_id
      WHERE ${employeeWhere}
      ORDER BY nama ASC
    `,
    employeeParams
  );

  const employeeMap = new Map();
  for (const row of Array.isArray(employeeRowsRaw) ? employeeRowsRaw : []) {
    const employeeId = Number(row.id);
    if (!employeeId || employeeMap.has(employeeId)) continue;
    employeeMap.set(employeeId, {
      id: employeeId,
      nama: row.nama,
      pin: row.pin,
      group_id: row.group_id != null ? Number(row.group_id) : null,
      nama_group: row.nama_group || null,
    });
  }

  if (employeeMap.size === 0) {
    return NextResponse.json({ from, to, dates: buildDateRange(from, to), rows: [] });
  }

  const punchFilters = [
    "DATE_FORMAT(sl.scan_date, '%Y-%m-%d') BETWEEN ? AND ?",
    canFilterDeleted ? 'k.isDeleted = 0' : null,
    ...employeeFilters,
  ]
    .filter(Boolean)
    .join(' AND ');

  const punchParams = [from, to, ...employeeParams];

  const [punchRowsRaw] = await pool.query(
    `
      SELECT
        k.id AS karyawan_id,
        DATE_FORMAT(sl.scan_date, '%Y-%m-%d') AS tanggal,
        DATE_FORMAT(sl.scan_date, '%H:%i:%s') AS scan_time
      FROM tb_scanlog sl
      JOIN tb_karyawan k ON k.pin = sl.pin
      LEFT JOIN (
        SELECT karyawan_id, MIN(group_id) AS group_id
        FROM tb_employee_group
        GROUP BY karyawan_id
      ) eg ON eg.karyawan_id = k.id
      WHERE ${punchFilters}
      ORDER BY k.id ASC, sl.scan_date ASC
    `,
    punchParams
  );

  const cellsByKey = new Map();
  for (const row of Array.isArray(punchRowsRaw) ? punchRowsRaw : []) {
    const employeeId = Number(row.karyawan_id);
    if (!employeeId || !employeeMap.has(employeeId)) continue;
    const dateKey = String(row.tanggal || '');
    const timeValue = String(row.scan_time || '');
    if (!dateKey || !timeValue) continue;
    const key = `${employeeId}|${dateKey}`;
    const current = cellsByKey.get(key) || [];
    current.push(timeValue);
    cellsByKey.set(key, current);
  }

  const dates = buildDateRange(from, to);
  const rows = [...employeeMap.values()].map((employee) => {
    const cells = {};
    for (const dateKey of dates) {
      const punchTimes = cellsByKey.get(`${employee.id}|${dateKey}`) || [];
      if (!punchTimes.length) continue;
      cells[dateKey] = {
        punch_times: punchTimes,
        count: punchTimes.length,
        first_scan: punchTimes[0] || null,
        last_scan: punchTimes[punchTimes.length - 1] || null,
      };
    }
    return { employee, cells };
  });

  return NextResponse.json({ from, to, dates, rows });
}
