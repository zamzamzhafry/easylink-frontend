export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { hasKaryawanColumn } from '@/lib/karyawan-schema';
import {
  forbiddenResponse,
  getAllowedGroupIds,
  getAuthContextFromCookies,
  isAllowedGroup,
  unauthorizedResponse,
} from '@/lib/auth-session';

function toMinutes(value) {
  if (!value || typeof value !== 'string') return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function summaryCsv(rows) {
  const headers = [
    'Employee',
    'PIN',
    'Group',
    'Total Days',
    'On Time',
    'Late',
    'Early Leave',
    'Anomaly',
    'Late Rate (%)',
  ];
  const lines = rows.map((item) => [
    item.nama,
    item.pin,
    item.group,
    item.total_days,
    item.on_time_days,
    item.late_days,
    item.early_days,
    item.anomaly_days,
    item.late_rate,
  ]);
  return [headers, ...lines].map((line) => line.map(csvEscape).join(',')).join('\n');
}

export async function GET(req) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse('Login required.');
  if (!auth.is_admin && !auth.can_dashboard) {
    return forbiddenResponse('You do not have dashboard permission.');
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') || new Date().toISOString().slice(0, 10);
  const to = searchParams.get('to') || from;
  const groupParam = searchParams.get('group_id');
  const employeeParam = searchParams.get('employee_id');
  const download = searchParams.get('download') || '';

  const groupId = Number.parseInt(groupParam ?? '', 10);
  const employeeId = Number.parseInt(employeeParam ?? '', 10);
  const canFilterDeleted = await hasKaryawanColumn('isDeleted');
  const allowedGroups = getAllowedGroupIds(auth, 'dashboard');

  if (!auth.is_admin && Number.isInteger(groupId) && !isAllowedGroup(auth, groupId, 'dashboard')) {
    return forbiddenResponse('This group is not approved for your dashboard access.');
  }

  if (!auth.is_admin && allowedGroups && allowedGroups.length === 0) {
    if (download) {
      return new NextResponse(summaryCsv([]), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="performance_${from}_${to}.csv"`,
        },
      });
    }
    return NextResponse.json({ ok: true, rows: [], summary: [], daily: [] });
  }

  let query = `
    SELECT
      logs.pin,
      logs.scan_date,
      logs.masuk,
      logs.keluar,
      logs.scan_count,
      k.id AS karyawan_id,
      COALESCE(k.nama, u.nama, logs.pin) AS nama,
      eg.group_id,
      g.nama_group,
      st.nama_shift,
      st.jam_masuk,
      st.jam_keluar,
      st.next_day
    FROM (
      SELECT
        sl.pin,
        DATE(sl.scan_date) AS scan_date,
        MIN(TIME(sl.scan_date)) AS masuk,
        MAX(TIME(sl.scan_date)) AS keluar,
        COUNT(*) AS scan_count
      FROM tb_scanlog sl
      WHERE DATE(sl.scan_date) BETWEEN ? AND ?
      GROUP BY sl.pin, DATE(sl.scan_date)
    ) logs
    LEFT JOIN tb_karyawan k ON k.pin = logs.pin ${canFilterDeleted ? 'AND k.isDeleted = 0' : ''}
    LEFT JOIN tb_user u ON u.pin = logs.pin
    LEFT JOIN tb_employee_group eg ON eg.karyawan_id = k.id
    LEFT JOIN tb_group g ON g.id = eg.group_id
    LEFT JOIN tb_schedule sc ON sc.karyawan_id = k.id AND sc.tanggal = logs.scan_date
    LEFT JOIN tb_shift_type st ON st.id = sc.shift_id
    WHERE 1 = 1
  `;
  const params = [from, to];

  if (Number.isInteger(groupId)) {
    query += ' AND eg.group_id = ?';
    params.push(groupId);
  }

  if (!auth.is_admin && allowedGroups) {
    query += ` AND eg.group_id IN (${allowedGroups.map(() => '?').join(',')})`;
    params.push(...allowedGroups);
  }

  if (Number.isInteger(employeeId)) {
    query += ' AND k.id = ?';
    params.push(employeeId);
  }

  query += ' ORDER BY logs.scan_date ASC, nama ASC';

  const [rows] = await pool.query(query, params);

  const lateMinutesThreshold = 15;
  const normalizedRows = rows.map((row) => {
    let status = 'normal';
    const flags = [];

    const scheduledInMinutes = toMinutes(row.jam_masuk);
    const actualInMinutes = toMinutes(row.masuk);
    if (scheduledInMinutes !== null && actualInMinutes !== null) {
      if (actualInMinutes - scheduledInMinutes > lateMinutesThreshold) {
        status = 'terlambat';
        flags.push('terlambat');
      }
    }

    const scheduledOutMinutes = toMinutes(row.jam_keluar);
    const actualOutMinutes = toMinutes(row.keluar);
    if (scheduledOutMinutes !== null && actualOutMinutes !== null && !row.next_day) {
      if (scheduledOutMinutes - actualOutMinutes > lateMinutesThreshold) {
        status = status === 'normal' ? 'pulang_awal' : status;
        flags.push('pulang_awal');
      }
    }

    return {
      ...row,
      status,
      flags,
      scan_date: String(row.scan_date).slice(0, 10),
    };
  });

  const summaryMap = new Map();
  const dailyMap = new Map();

  normalizedRows.forEach((row) => {
    const key = row.karyawan_id ? `id-${row.karyawan_id}` : `pin-${row.pin}`;
    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        key,
        employee_id: row.karyawan_id ? Number(row.karyawan_id) : null,
        nama: row.nama,
        pin: row.pin,
        group: row.nama_group || '-',
        total_days: 0,
        on_time_days: 0,
        late_days: 0,
        early_days: 0,
        anomaly_days: 0,
      });
    }

    const bucket = summaryMap.get(key);
    bucket.total_days += 1;
    if (row.status === 'terlambat' || row.flags.includes('terlambat')) bucket.late_days += 1;
    if (row.status === 'pulang_awal' || row.flags.includes('pulang_awal')) bucket.early_days += 1;
    if (row.status === 'normal') bucket.on_time_days += 1;
    else bucket.anomaly_days += 1;

    if (!dailyMap.has(row.scan_date)) {
      dailyMap.set(row.scan_date, {
        tanggal: row.scan_date,
        on_time: 0,
        late: 0,
        early: 0,
        anomaly: 0,
        total: 0,
      });
    }
    const daily = dailyMap.get(row.scan_date);
    daily.total += 1;
    if (row.status === 'terlambat' || row.flags.includes('terlambat')) daily.late += 1;
    if (row.status === 'pulang_awal' || row.flags.includes('pulang_awal')) daily.early += 1;
    if (row.status === 'normal') daily.on_time += 1;
    else daily.anomaly += 1;
  });

  const summary = [...summaryMap.values()]
    .map((item) => ({
      ...item,
      late_rate: item.total_days ? Number(((item.late_days / item.total_days) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.late_days - a.late_days || b.anomaly_days - a.anomaly_days);
  const daily = [...dailyMap.values()].sort((a, b) => a.tanggal.localeCompare(b.tanggal));

  if (download) {
    return new NextResponse(summaryCsv(summary), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="performance_${from}_${to}.csv"`,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    rows: normalizedRows,
    summary,
    daily,
  });
}


