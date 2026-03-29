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

const DRILLDOWN_LIMIT = 400;
const LATE_THRESHOLD_MINUTES = 15;
const STATUS_KEYS = ['on_time', 'late', 'early_leave', 'anomaly'];
const STATUS_LABELS = {
  on_time: 'On Time',
  late: 'Late',
  early_leave: 'Early Leave',
  anomaly: 'Anomaly',
};

function parseDateParam(value, fallback) {
  if (!value) return fallback;
  const normalized = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  return fallback;
}

function toMinutes(value) {
  if (!value || typeof value !== 'string') return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function createStatusCounts() {
  return STATUS_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function categorizeRow(row) {
  const flags = Array.isArray(row.flags) ? row.flags : [];
  const hasLate = row.status === 'terlambat' || flags.includes('terlambat');
  const hasEarly = row.status === 'pulang_awal' || flags.includes('pulang_awal');
  if (hasLate) return 'late';
  if (hasEarly) return 'early_leave';
  if (row.status !== 'normal' || flags.length > 0) return 'anomaly';
  return 'on_time';
}

function buildNormalizedRows(rawRows) {
  if (!Array.isArray(rawRows)) return [];
  return rawRows.map((row) => {
    let status = 'normal';
    const flags = [];
    const scheduledIn = toMinutes(row.jam_masuk);
    const scheduledOut = toMinutes(row.jam_keluar);
    const actualIn = toMinutes(row.masuk);
    const actualOut = toMinutes(row.keluar);
    if (scheduledIn !== null && actualIn !== null) {
      if (actualIn - scheduledIn > LATE_THRESHOLD_MINUTES) {
        status = 'terlambat';
        flags.push('terlambat');
      }
    }
    const isNextDay = Number(row.next_day ?? 0) === 1;
    if (scheduledOut !== null && actualOut !== null && !isNextDay) {
      if (scheduledOut - actualOut > LATE_THRESHOLD_MINUTES) {
        if (status === 'normal') {
          status = 'pulang_awal';
        }
        flags.push('pulang_awal');
      }
    }
    return {
      ...row,
      status,
      flags,
      scan_date: String(row.scan_date).slice(0, 10),
      scan_count: Number(row.scan_count ?? 0),
    };
  });
}

function buildSeries(rows) {
  const totals = createStatusCounts();
  const groupMap = new Map();

  rows.forEach((row) => {
    const statusKey = categorizeRow(row);
    totals[statusKey] += 1;
    const groupId = row.group_id == null ? 'group-ungrouped' : `group-${row.group_id}`;
    const groupLabel = row.nama_group || 'Ungrouped';
    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, {
        label: groupLabel,
        counts: createStatusCounts(),
      });
    }
    groupMap.get(groupId).counts[statusKey] += 1;
  });

  const orderedGroups = [...groupMap.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const pie = STATUS_KEYS.map((key) => ({
    key,
    name: STATUS_LABELS[key],
    value: totals[key],
  }));

  const barSeries = STATUS_KEYS.map((key) => ({
    name: STATUS_LABELS[key],
    data: orderedGroups.map((group) => group.counts[key]),
  }));

  const categories = orderedGroups.map((group) => group.label);

  return {
    pie,
    bar: {
      categories,
      series: barSeries,
    },
  };
}

function formatDrilldownRow(row) {
  const groupId = row.group_id == null ? null : Number(row.group_id);
  return {
    employee_id: row.karyawan_id == null ? null : Number(row.karyawan_id),
    employee_name: row.nama,
    pin: row.pin,
    group_id: Number.isFinite(groupId) ? groupId : null,
    group_name: row.nama_group || 'Ungrouped',
    shift_name: row.nama_shift || null,
    scheduled_in: row.jam_masuk || null,
    scheduled_out: row.jam_keluar || null,
    actual_in: row.masuk || null,
    actual_out: row.keluar || null,
    scan_date: row.scan_date,
    status: row.status,
    flags: Array.isArray(row.flags) ? row.flags : [],
    scan_count: Number(row.scan_count ?? 0),
  };
}

function buildDrilldownPayload(rows) {
  const total = rows.length;
  const limited = rows.slice(0, DRILLDOWN_LIMIT);
  return {
    rows: limited.map(formatDrilldownRow),
    limit: DRILLDOWN_LIMIT,
    total,
    truncated: total > DRILLDOWN_LIMIT,
  };
}

function reportCsv(rows) {
  const headers = [
    'Employee',
    'PIN',
    'Group',
    'Scan Date',
    'Status',
    'Flags',
    'Shift',
    'Scheduled In',
    'Scheduled Out',
    'Actual In',
    'Actual Out',
    'Scan Count',
  ];

  const lines = rows.map((row) => {
    const flagString = Array.isArray(row.flags) ? row.flags.join(';') : '';
    return [
      row.nama,
      row.pin,
      row.nama_group || 'Ungrouped',
      row.scan_date,
      row.status,
      flagString,
      row.nama_shift || '',
      row.jam_masuk || '',
      row.jam_keluar || '',
      row.masuk || '',
      row.keluar || '',
      row.scan_count ?? 0,
    ];
  });

  return [headers, ...lines].map((line) => line.map(csvEscape).join(',')).join('\n');
}

export async function GET(req) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse('Login required.');
  if (!auth.is_admin && !auth.can_dashboard) {
    return forbiddenResponse('You do not have dashboard permission.');
  }

  const { searchParams } = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const from = parseDateParam(searchParams.get('from'), today);
  const to = parseDateParam(searchParams.get('to'), from);
  const groupParam = searchParams.get('group_id');
  const employeeParam = searchParams.get('employee_id');
  const wantsDownload = searchParams.get('download') === '1';

  const parsedGroupId = Number.parseInt(groupParam ?? '', 10);
  const parsedEmployeeId = Number.parseInt(employeeParam ?? '', 10);
  const groupFilter = Number.isInteger(parsedGroupId) ? parsedGroupId : null;
  const employeeFilter = Number.isInteger(parsedEmployeeId) ? parsedEmployeeId : null;

  const filters = {
    from,
    to,
    group_id: groupFilter,
    employee_id: employeeFilter,
  };

  const allowedGroupIds = getAllowedGroupIds(auth, 'dashboard');

  if (groupFilter !== null && !auth.is_admin && !isAllowedGroup(auth, groupFilter, 'dashboard')) {
    return forbiddenResponse('This group is not approved for your dashboard access.');
  }

  if (!auth.is_admin && Array.isArray(allowedGroupIds) && allowedGroupIds.length === 0) {
    if (wantsDownload) {
      return new NextResponse(reportCsv([]), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="report_${from}_${to}.csv"`,
        },
      });
    }
    return NextResponse.json({
      ok: true,
      filters,
      series: buildSeries([]),
      drilldown: buildDrilldownPayload([]),
      metadata: {
        totalRecords: 0,
        drilldownLimit: DRILLDOWN_LIMIT,
      },
    });
  }

  const canFilterDeleted = await hasKaryawanColumn('isDeleted');
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

  if (groupFilter !== null) {
    query += ' AND eg.group_id = ?';
    params.push(groupFilter);
  }

  if (!auth.is_admin && Array.isArray(allowedGroupIds) && allowedGroupIds.length > 0) {
    query += ` AND eg.group_id IN (${allowedGroupIds.map(() => '?').join(',')})`;
    params.push(...allowedGroupIds);
  }

  if (employeeFilter !== null) {
    query += ' AND k.id = ?';
    params.push(employeeFilter);
  }

  query += ' ORDER BY g.nama_group IS NULL, g.nama_group ASC, logs.scan_date ASC, nama ASC';

  const [rows] = await pool.query(query, params);
  const normalizedRows = buildNormalizedRows(rows);
  const sortedRows = [...normalizedRows].sort((a, b) => {
    const groupA = String(a.nama_group ?? '').localeCompare(String(b.nama_group ?? ''));
    if (groupA !== 0) return groupA;
    const dateComp = String(a.scan_date ?? '').localeCompare(String(b.scan_date ?? ''));
    if (dateComp !== 0) return dateComp;
    return String(a.nama ?? '').localeCompare(String(b.nama ?? ''));
  });

  if (wantsDownload) {
    return new NextResponse(reportCsv(sortedRows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="report_${from}_${to}.csv"`,
      },
    });
  }

  const series = buildSeries(sortedRows);
  const drilldown = buildDrilldownPayload(sortedRows);

  return NextResponse.json({
    ok: true,
    filters,
    series,
    drilldown,
    metadata: {
      totalRecords: sortedRows.length,
      drilldownLimit: DRILLDOWN_LIMIT,
    },
  });
}
