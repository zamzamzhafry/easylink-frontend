export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import pool from '@/lib/db';
import { hasKaryawanColumn } from '@/lib/karyawan-schema';
import { resolveDateRange } from '@/lib/date-range';
import { csvEscape } from '@/lib/csv';
import { toMinutes } from '@/lib/time';
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

function formatDrilldownRow(row, isAdmin) {
  const groupId = row.group_id == null ? null : Number(row.group_id);
  const scheduledIn = toMinutes(row.jam_masuk);
  const scheduledOut = toMinutes(row.jam_keluar);
  const actualIn = toMinutes(row.masuk);
  const actualOut = toMinutes(row.keluar);
  
  let workedMinutes = null;
  if (actualIn !== null && actualOut !== null) {
    const isNextDay = Number(row.next_day ?? 0) === 1;
    if (isNextDay) {
      workedMinutes = (1440 - actualIn) + actualOut;
    } else {
      workedMinutes = actualOut - actualIn;
    }
  }
  
  const drilldownRow = {
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
    worked_minutes: workedMinutes,
    scan_date: row.scan_date,
    status: row.status,
    flags: Array.isArray(row.flags) ? row.flags : [],
    scan_count: Number(row.scan_count ?? 0),
  };

  if (!isAdmin) {
    delete drilldownRow.flags;
  }

  return drilldownRow;
}

function buildDrilldownPayload(rows, isAdmin, page = 1, limit = DRILLDOWN_LIMIT) {
  const total = rows.length;
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginated = rows.slice(startIndex, endIndex);
  return {
    rows: paginated.map(row => formatDrilldownRow(row, isAdmin)),
    limit: limit,
    page: page,
    total,
    totalPages: Math.ceil(total / limit),
    truncated: total > endIndex,
  };
}

function reportCsv(rows, isAdmin) {
  const headers = [
    'Employee',
    'PIN',
    'Group',
    'Scan Date',
    'Status',
    ...(isAdmin ? ['Flags'] : []),
    'Shift',
    'Scheduled In',
    'Scheduled Out',
    'Actual In',
    'Actual Out',
    'Scan Count',
  ];

  const lines = rows.map((row) => {
    const flagString = Array.isArray(row.flags) ? row.flags.join(';') : '';
    const data = [
      row.nama,
      row.pin,
      row.nama_group || 'Ungrouped',
      row.scan_date,
      row.status,
      ...(isAdmin ? [flagString] : []),
      row.nama_shift || '',
      row.jam_masuk || '',
      row.jam_keluar || '',
      row.masuk || '',
      row.keluar || '',
      row.scan_count ?? 0,
    ];
    return data;
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
  const range = resolveDateRange(searchParams.get('from'), searchParams.get('to'));
  if (range.error) {
    return NextResponse.json({ ok: false, error: range.error }, { status: range.status });
  }
  const { from, to } = range;
  const groupParam = searchParams.get('group_id');
  const employeeParam = searchParams.get('employee_id');
  const wantsDownload = searchParams.get('download') === '1';
  const wantsExcel = searchParams.get('excel') === '1';
  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(1000, Math.max(1, Number.parseInt(searchParams.get('limit') || String(DRILLDOWN_LIMIT), 10)));
  const drilldownStatus = searchParams.get('drilldown_status') || null;
  const drilldownGroup = searchParams.get('drilldown_group') || null;

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
      return new NextResponse(reportCsv([], auth.is_admin), {
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
      drilldown: buildDrilldownPayload([], auth.is_admin, page, limit),
      metadata: {
        totalRecords: 0,
        drilldownLimit: limit,
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
      DATE_FORMAT(sl.scan_date, '%Y-%m-%d') AS scan_date,
        MIN(TIME(sl.scan_date)) AS masuk,
        MAX(TIME(sl.scan_date)) AS keluar,
        COUNT(*) AS scan_count
      FROM tb_scanlog sl
      WHERE DATE_FORMAT(sl.scan_date, '%Y-%m-%d') BETWEEN ? AND ?
        GROUP BY sl.pin, DATE_FORMAT(sl.scan_date, '%Y-%m-%d')
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
    return new NextResponse(reportCsv(sortedRows, auth.is_admin), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="report_${from}_${to}.csv"`,
      },
    });
  }

  if (wantsExcel) {
    const workbook = XLSX.utils.book_new();
    
    const dataHeaders = [
      'Date',
      'Employee',
      'PIN',
      'Group',
      'Status',
      ...(auth.is_admin ? ['Flags'] : []),
      'Shift',
      'Scheduled In',
      'Scheduled Out',
      'Actual In',
      'Actual Out',
      'Worked Hours',
      'Scans',
    ];
    
    const dataRows = sortedRows.map(row => {
      const workedMinutes = row.worked_minutes != null ? row.worked_minutes : null;
      const workedHours = workedMinutes != null 
        ? `${Math.floor(workedMinutes / 60)}h ${workedMinutes % 60}m`
        : '-';
      
      return [
        row.scan_date,
        row.nama,
        row.pin,
        row.nama_group || 'Ungrouped',
        row.status,
        ...(auth.is_admin ? [Array.isArray(row.flags) ? row.flags.join(';') : ''] : []),
        row.nama_shift || '',
        row.jam_masuk || '',
        row.jam_keluar || '',
        row.masuk || '',
        row.keluar || '',
        workedHours,
        row.scan_count ?? 0,
      ];
    });
    
    const dataSheet = XLSX.utils.aoa_to_sheet([dataHeaders, ...dataRows]);
    XLSX.utils.book_append_sheet(workbook, dataSheet, 'Attendance Data');
    
    const series = buildSeries(sortedRows);
    const pieHeaders = ['Status', 'Count'];
    const pieRows = series.pie.map(item => [item.name, item.value]);
    const pieSheet = XLSX.utils.aoa_to_sheet([pieHeaders, ...pieRows]);
    XLSX.utils.book_append_sheet(workbook, pieSheet, 'Status Summary');
    
    const barHeaders = ['Group', ...series.bar.series.map(s => s.name)];
    const barRows = series.bar.categories.map((category, idx) => [
      category,
      ...series.bar.series.map(s => s.data[idx])
    ]);
    const barSheet = XLSX.utils.aoa_to_sheet([barHeaders, ...barRows]);
    XLSX.utils.book_append_sheet(workbook, barSheet, 'Group Summary');
    
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="report_${from}_${to}.xlsx"`,
      },
    });
  }

  const series = buildSeries(sortedRows);
  
  let filteredForDrilldown = sortedRows;
  if (drilldownStatus) {
    filteredForDrilldown = filteredForDrilldown.filter(row => categorizeRow(row) === drilldownStatus);
  }
  if (drilldownGroup) {
      filteredForDrilldown = filteredForDrilldown.filter(row => {
          const groupId = row.group_id == null ? 'group-ungrouped' : `group-${row.group_id}`;
          return groupId === drilldownGroup || row.nama_group === drilldownGroup;
      });
  }

  filteredForDrilldown.sort((a, b) => {
    const dateComp = String(b.scan_date ?? '').localeCompare(String(a.scan_date ?? ''));
    if (dateComp !== 0) return dateComp;
    const groupComp = String(a.nama_group ?? '').localeCompare(String(b.nama_group ?? ''));
    if (groupComp !== 0) return groupComp;
    return String(a.nama ?? '').localeCompare(String(b.nama ?? ''));
  });

  const drilldown = buildDrilldownPayload(filteredForDrilldown, auth.is_admin, page, limit);

  // Fetch all available groups for filter dropdown
  let groupsQuery = `
    SELECT g.id, g.nama_group
    FROM tb_group g
    WHERE 1 = 1
  `;
  const groupsParams = [];
  if (!auth.is_admin && Array.isArray(allowedGroupIds) && allowedGroupIds.length > 0) {
    groupsQuery += ` AND g.id IN (${allowedGroupIds.map(() => '?').join(',')})`;
    groupsParams.push(...allowedGroupIds);
  }
  groupsQuery += ' ORDER BY g.nama_group ASC';
  const [groupsRows] = await pool.query(groupsQuery, groupsParams);
  const availableGroups = groupsRows.map(g => ({ id: Number(g.id), label: g.nama_group }));

  // Fetch all available employees for filter dropdown
  let employeesQuery = `
    SELECT DISTINCT k.id, k.nama, k.pin
    FROM tb_karyawan k
    WHERE 1 = 1 ${canFilterDeleted ? 'AND k.isDeleted = 0' : ''}
  `;
  const employeesParams = [];

  if (groupFilter !== null) {
    employeesQuery += `
      AND EXISTS (
        SELECT 1 FROM tb_employee_group eg
        WHERE eg.karyawan_id = k.id
        AND eg.group_id = ?
      )
    `;
    employeesParams.push(groupFilter);
  }

  if (!auth.is_admin && Array.isArray(allowedGroupIds) && allowedGroupIds.length > 0) {
    employeesQuery += `
      AND EXISTS (
        SELECT 1 FROM tb_employee_group eg
        WHERE eg.karyawan_id = k.id
        AND eg.group_id IN (${allowedGroupIds.map(() => '?').join(',')})
      )
    `;
    employeesParams.push(...allowedGroupIds);
  }
  employeesQuery += ' ORDER BY k.nama ASC';
  const [employeesRows] = await pool.query(employeesQuery, employeesParams);
  const availableEmployees = employeesRows.map(e => ({
    id: Number(e.id),
    label: `${e.nama}${e.pin ? ` (${e.pin})` : ''}`
  }));

  return NextResponse.json({
    ok: true,
    filters,
    series,
    drilldown,
    metadata: {
      totalRecords: sortedRows.length,
      drilldownLimit: limit,
      drilldownTotal: drilldown.total
    },
    availableGroups,
    availableEmployees,
  });
}
