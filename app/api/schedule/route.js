export const dynamic = 'force-dynamic';
// app/api/schedule/route.js
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { hasKaryawanColumn } from '@/lib/karyawan-schema';
import { hasShiftColumn } from '@/lib/shift-table-schema';
import {
  forbiddenResponse,
  getAllowedGroupIds,
  getAuthContextFromCookies,
  isAllowedGroup,
  unauthorizedResponse,
} from '@/lib/auth-session';

function invalid(message) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

function buildInPlaceholders(values) {
  return values.map(() => '?').join(',');
}

async function ensureScheduleAccess() {
  const auth = await getAuthContextFromCookies();
  if (!auth) return { error: unauthorizedResponse('Login required.') };
  if (!auth.is_admin && !auth.can_schedule) {
    return { error: forbiddenResponse('You do not have schedule permission.') };
  }

  return {
    auth,
    allowedGroupIds: getAllowedGroupIds(auth, 'schedule'),
  };
}

async function employeeAllowed(employeeId, allowedGroupIds) {
  if (!allowedGroupIds) return true;
  if (!allowedGroupIds.length) return false;

  const [[row]] = await pool.query(
    `SELECT eg.group_id
     FROM tb_employee_group eg
     WHERE eg.karyawan_id = ?
     LIMIT 1`,
    [employeeId]
  );

  if (!row) return false;
  return allowedGroupIds.includes(Number(row.group_id));
}

export async function GET(req) {
  const authCheck = await ensureScheduleAccess();
  if (authCheck.error) return authCheck.error;

  const { auth, allowedGroupIds } = authCheck;
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const groupParam = searchParams.get('group_id');
  const groupId = Number.parseInt(groupParam ?? '', 10);
  const canFilterDeleted = await hasKaryawanColumn('isDeleted');
  const hasShiftActive = await hasShiftColumn('is_active');
  const hasShiftIcon = await hasShiftColumn('icon_key');

  if (!from || !to) return invalid('from and to are required.');

  if (!auth.is_admin && Number.isInteger(groupId) && !isAllowedGroup(auth, groupId, 'schedule')) {
    return forbiddenResponse('This group is not approved for your schedule access.');
  }

  const [shifts] = await pool.query(
    `SELECT *
     FROM tb_shift_type
     ORDER BY ${hasShiftActive ? 'is_active DESC,' : ''} id ASC`
  );

  if (!auth.is_admin && allowedGroupIds && allowedGroupIds.length === 0) {
    return NextResponse.json({ shifts, schedules: [], employees: [], scanCompletions: [] });
  }

  let schedulesQuery = `
    SELECT sc.id, sc.karyawan_id, DATE_FORMAT(sc.tanggal, '%Y-%m-%d') AS tanggal, sc.shift_id, sc.catatan,
           st.nama_shift, st.jam_masuk, st.jam_keluar, st.next_day, st.color_hex,
           ${hasShiftActive ? 'st.is_active,' : '1 AS is_active,'}
           ${hasShiftIcon ? 'st.icon_key,' : 'NULL AS icon_key,'}
           COALESCE(k.nama, u.nama, k.pin) AS nama,
           k.pin,
           eg.group_id,
           g.nama_group
    FROM tb_schedule sc
    JOIN tb_karyawan k ON k.id = sc.karyawan_id
    LEFT JOIN tb_user u ON u.pin = k.pin
    JOIN tb_shift_type st ON st.id = sc.shift_id
    LEFT JOIN tb_employee_group eg ON eg.karyawan_id = k.id
    LEFT JOIN tb_group g ON g.id = eg.group_id
    WHERE sc.tanggal BETWEEN ? AND ?
      ${canFilterDeleted ? 'AND k.isDeleted = 0' : ''}
  `;
  const scheduleParams = [from, to];

  if (Number.isInteger(groupId)) {
    schedulesQuery += ' AND eg.group_id = ?';
    scheduleParams.push(groupId);
  }

  if (!auth.is_admin && allowedGroupIds) {
    schedulesQuery += ` AND eg.group_id IN (${buildInPlaceholders(allowedGroupIds)})`;
    scheduleParams.push(...allowedGroupIds);
  }

  schedulesQuery += ' ORDER BY sc.tanggal, nama';

  let employeesQuery = `
    SELECT k.id, COALESCE(k.nama, u.nama, k.pin) AS nama, k.pin,
           eg.group_id, g.nama_group
    FROM tb_karyawan k
    LEFT JOIN tb_user u ON u.pin = k.pin
    LEFT JOIN tb_employee_group eg ON eg.karyawan_id = k.id
    LEFT JOIN tb_group g ON g.id = eg.group_id
    WHERE 1 = 1
      ${canFilterDeleted ? 'AND k.isDeleted = 0' : ''}
  `;
  const employeeParams = [];

  if (Number.isInteger(groupId)) {
    employeesQuery += ' AND eg.group_id = ?';
    employeeParams.push(groupId);
  }

  if (!auth.is_admin && allowedGroupIds) {
    employeesQuery += ` AND eg.group_id IN (${buildInPlaceholders(allowedGroupIds)})`;
    employeeParams.push(...allowedGroupIds);
  }

  employeesQuery += ' ORDER BY nama';

  let scanQuery = `
    SELECT
      k.id AS karyawan_id,
      DATE_FORMAT(DATE(sl.scan_date), '%Y-%m-%d') AS tanggal,
      COUNT(*) AS scan_count
    FROM tb_scanlog sl
    JOIN tb_karyawan k ON k.pin = sl.pin
    LEFT JOIN tb_employee_group eg ON eg.karyawan_id = k.id
    WHERE DATE(sl.scan_date) BETWEEN ? AND ?
      ${canFilterDeleted ? 'AND k.isDeleted = 0' : ''}
  `;
  const scanParams = [from, to];

  if (Number.isInteger(groupId)) {
    scanQuery += ' AND eg.group_id = ?';
    scanParams.push(groupId);
  }

  if (!auth.is_admin && allowedGroupIds) {
    scanQuery += ` AND eg.group_id IN (${buildInPlaceholders(allowedGroupIds)})`;
    scanParams.push(...allowedGroupIds);
  }

  scanQuery += ' GROUP BY k.id, DATE(sl.scan_date)';

  const [schedules] = await pool.query(schedulesQuery, scheduleParams);
  const [employees] = await pool.query(employeesQuery, employeeParams);
  const [scanCompletions] = await pool.query(scanQuery, scanParams);

  return NextResponse.json({ shifts, schedules, employees, scanCompletions });
}

export async function POST(req) {
  const authCheck = await ensureScheduleAccess();
  if (authCheck.error) return authCheck.error;

  const { auth, allowedGroupIds } = authCheck;
  const body = await req.json();
  const canFilterDeleted = await hasKaryawanColumn('isDeleted');

  if (body.action === 'set') {
    const employeeId = Number(body.karyawan_id);
    if (!Number.isInteger(employeeId)) return invalid('karyawan_id is required.');
    if (!auth.is_admin && !(await employeeAllowed(employeeId, allowedGroupIds))) {
      return forbiddenResponse('Employee is outside your approved group scope.');
    }

    await pool.query(
      `INSERT INTO tb_schedule (karyawan_id, tanggal, shift_id, catatan)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE shift_id = VALUES(shift_id), catatan = VALUES(catatan)`,
      [employeeId, body.tanggal, body.shift_id, body.catatan ?? null]
    );
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'clear') {
    const employeeId = Number(body.karyawan_id);
    if (!Number.isInteger(employeeId)) return invalid('karyawan_id is required.');
    if (!auth.is_admin && !(await employeeAllowed(employeeId, allowedGroupIds))) {
      return forbiddenResponse('Employee is outside your approved group scope.');
    }

    await pool.query('DELETE FROM tb_schedule WHERE karyawan_id = ? AND tanggal = ?', [employeeId, body.tanggal]);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'bulk_group') {
    const groupId = Number(body.group_id);
    if (!Number.isInteger(groupId)) return invalid('group_id is required.');

    if (!auth.is_admin && !isAllowedGroup(auth, groupId, 'schedule')) {
      return forbiddenResponse('This group is not approved for your schedule access.');
    }

    const { shift_id, from, to } = body;
    const [members] = await pool.query('SELECT karyawan_id FROM tb_employee_group WHERE group_id = ?', [groupId]);
    const dates = [];
    const cur = new Date(from);
    const end = new Date(to);

    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }

    for (const member of members) {
      for (const dateValue of dates) {
        await pool.query(
          `INSERT INTO tb_schedule (karyawan_id, tanggal, shift_id)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE shift_id = VALUES(shift_id)`,
          [member.karyawan_id, dateValue, shift_id]
        );
      }
    }

    return NextResponse.json({ ok: true, affected: members.length * dates.length });
  }

  if (body.action === 'bulk_rows') {
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) {
      return invalid('No import rows provided.');
    }

    const employeeIds = [...new Set(rows.map((row) => Number(row.karyawan_id)).filter(Boolean))];
    const shiftIds = [...new Set(rows.map((row) => Number(row.shift_id)).filter(Boolean))];

    if (!employeeIds.length || !shiftIds.length) {
      return invalid('Import rows must include valid employee IDs and shift IDs.');
    }

    if (!auth.is_admin && allowedGroupIds) {
      const [allowedEmployeeRows] = await pool.query(
        `SELECT eg.karyawan_id
         FROM tb_employee_group eg
         WHERE eg.karyawan_id IN (${buildInPlaceholders(employeeIds)})
           AND eg.group_id IN (${buildInPlaceholders(allowedGroupIds)})`,
        [...employeeIds, ...allowedGroupIds]
      );
      const allowedEmployeeSet = new Set(allowedEmployeeRows.map((item) => Number(item.karyawan_id)));
      const unauthorizedCount = employeeIds.filter((id) => !allowedEmployeeSet.has(Number(id))).length;
      if (unauthorizedCount > 0) {
        return forbiddenResponse(`Found ${unauthorizedCount} employee(s) outside your approved groups.`);
      }
    }

    const [employees] = await pool.query(
      `SELECT id FROM tb_karyawan
       WHERE id IN (${buildInPlaceholders(employeeIds)})
       ${canFilterDeleted ? 'AND isDeleted = 0' : ''}`,
      employeeIds
    );
    const [shifts] = await pool.query(
      `SELECT id FROM tb_shift_type WHERE id IN (${buildInPlaceholders(shiftIds)})`,
      shiftIds
    );

    const employeeSet = new Set(employees.map((employee) => Number(employee.id)));
    const shiftSet = new Set(shifts.map((shift) => Number(shift.id)));

    let affected = 0;
    const skipped = [];

    for (const row of rows) {
      const employeeId = Number(row.karyawan_id);
      const shiftId = Number(row.shift_id);
      const tanggal = row.tanggal;

      if (!employeeSet.has(employeeId) || !shiftSet.has(shiftId) || !tanggal) {
        skipped.push(row);
        continue;
      }

      await pool.query(
        `INSERT INTO tb_schedule (karyawan_id, tanggal, shift_id, catatan)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE shift_id = VALUES(shift_id), catatan = VALUES(catatan)`,
        [employeeId, tanggal, shiftId, row.catatan ?? null]
      );
      affected += 1;
    }

    return NextResponse.json({ ok: true, affected, skipped: skipped.length });
  }

  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 });
}

