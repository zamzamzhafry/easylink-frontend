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

const LATE_THRESHOLD_MINUTES = 15;

function toMinutes(value) {
  if (!value || typeof value !== 'string') return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
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

  const groupId = Number.parseInt(groupParam ?? '', 10);
  const employeeId = Number.parseInt(employeeParam ?? '', 10);
  const canFilterDeleted = await hasKaryawanColumn('isDeleted');
  const allowedGroups = getAllowedGroupIds(auth, 'dashboard');

  if (!auth.is_admin && Number.isInteger(groupId) && !isAllowedGroup(auth, groupId, 'dashboard')) {
    return forbiddenResponse('This group is not approved for your dashboard access.');
  }

  if (!auth.is_admin && allowedGroups && allowedGroups.length === 0) {
    return NextResponse.json({
      ok: true,
      metrics: {
        totalEmployees: 0,
        totalPresent: 0,
        attendanceRate: 0,
        punctualityIndex: 0,
        avgLateMinutes: 0,
        totalOvertime: 0,
      },
      bradfordFactors: [],
      checkInDistribution: Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 })),
      weeklyTrend: [],
      departmentBreakdown: [],
      heatmap: { employees: [], dates: [], data: [] },
    });
  }

  try {
    // Build base query for attendance data
    let baseQuery = `
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
        st.next_day,
        st.needs_scan
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

    if (!auth.is_admin && allowedGroups && allowedGroups.length > 0) {
      const placeholders = allowedGroups.map(() => '?').join(',');
      baseQuery += ` AND eg.group_id IN (${placeholders})`;
      params.push(...allowedGroups);
    }

    if (Number.isInteger(groupId)) {
      baseQuery += ' AND eg.group_id = ?';
      params.push(groupId);
    }

    if (Number.isInteger(employeeId)) {
      baseQuery += ' AND k.id = ?';
      params.push(employeeId);
    }

    baseQuery += ' ORDER BY logs.scan_date DESC, logs.pin';

    const [attendanceRows] = await pool.query(baseQuery, params);

    // Calculate metrics
    const metrics = calculateMetrics(attendanceRows, from, to);

    // Calculate Bradford Factors
    const bradfordFactors = await calculateBradfordFactors(
      from,
      to,
      groupId,
      employeeId,
      allowedGroups,
      auth.is_admin,
      canFilterDeleted
    );

    // Calculate check-in distribution by hour
    const checkInDistribution = calculateCheckInDistribution(attendanceRows);

    // Calculate weekly trend
    const weeklyTrend = await calculateWeeklyTrend(
      from,
      to,
      groupId,
      employeeId,
      allowedGroups,
      auth.is_admin,
      canFilterDeleted
    );

    // Calculate department breakdown
    const departmentBreakdown = calculateDepartmentBreakdown(attendanceRows);

    // Calculate heatmap data
    const heatmap = calculateHeatmap(attendanceRows, from, to);

    return NextResponse.json({
      ok: true,
      metrics,
      bradfordFactors,
      checkInDistribution,
      weeklyTrend,
      departmentBreakdown,
      heatmap,
    });
  } catch (error) {
    console.error('Analytics API error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function calculateMetrics(rows, from, to) {
  const employeeSet = new Set();
  let presentCount = 0;
  let onTimeCount = 0;
  let totalLateMinutes = 0;
  let lateCount = 0;
  let totalOvertimeMinutes = 0;

  rows.forEach((row) => {
    if (row.karyawan_id) {
      employeeSet.add(row.karyawan_id);
    }

    const needsScan = Number(row.needs_scan ?? 1) === 1;
    if (!needsScan) return;

    presentCount++;

    const scheduledIn = toMinutes(row.jam_masuk);
    const actualIn = toMinutes(row.masuk);
    const scheduledOut = toMinutes(row.jam_keluar);
    const actualOut = toMinutes(row.keluar);

    // Check punctuality
    if (scheduledIn !== null && actualIn !== null) {
      const lateMinutes = actualIn - scheduledIn;
      if (lateMinutes <= LATE_THRESHOLD_MINUTES) {
        onTimeCount++;
      } else {
        lateCount++;
        totalLateMinutes += lateMinutes;
      }
    }

    // Calculate overtime
    if (scheduledOut !== null && actualOut !== null) {
      const isNextDay = Number(row.next_day ?? 0) === 1;
      if (!isNextDay) {
        const overtimeMinutes = actualOut - scheduledOut;
        if (overtimeMinutes > 0) {
          totalOvertimeMinutes += overtimeMinutes;
        }
      }
    }
  });

  const totalEmployees = employeeSet.size;
  const attendanceRate = presentCount > 0 ? (presentCount / (totalEmployees * getDayCount(from, to))) * 100 : 0;
  const punctualityIndex = presentCount > 0 ? (onTimeCount / presentCount) * 100 : 0;
  const avgLateMinutes = lateCount > 0 ? totalLateMinutes / lateCount : 0;

  return {
    totalEmployees,
    totalPresent: presentCount,
    attendanceRate: Math.round(attendanceRate * 100) / 100,
    punctualityIndex: Math.round(punctualityIndex * 100) / 100,
    avgLateMinutes: Math.round(avgLateMinutes * 100) / 100,
    totalOvertime: totalOvertimeMinutes,
  };
}

function getDayCount(from, to) {
  const start = new Date(from);
  const end = new Date(to);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays;
}

async function calculateBradfordFactors(from, to, groupId, employeeId, allowedGroups, isAdmin, canFilterDeleted) {
  let query = `
    SELECT
      k.id AS employee_id,
      k.nama,
      k.pin,
      g.nama_group AS \`group\`,
      COUNT(DISTINCT DATE(sc.tanggal)) AS scheduled_days,
      COUNT(DISTINCT DATE(sl.scan_date)) AS present_days
    FROM tb_karyawan k
    LEFT JOIN tb_employee_group eg ON eg.karyawan_id = k.id
    LEFT JOIN tb_group g ON g.id = eg.group_id
    LEFT JOIN tb_schedule sc ON sc.karyawan_id = k.id AND sc.tanggal BETWEEN ? AND ?
    LEFT JOIN tb_shift_type st ON st.id = sc.shift_id
    LEFT JOIN tb_scanlog sl ON sl.pin = k.pin AND DATE(sl.scan_date) = sc.tanggal
    WHERE st.needs_scan = 1 ${canFilterDeleted ? 'AND k.isDeleted = 0' : ''}
  `;

  const params = [from, to];

  if (!isAdmin && allowedGroups && allowedGroups.length > 0) {
    const placeholders = allowedGroups.map(() => '?').join(',');
    query += ` AND eg.group_id IN (${placeholders})`;
    params.push(...allowedGroups);
  }

  if (Number.isInteger(groupId)) {
    query += ' AND eg.group_id = ?';
    params.push(groupId);
  }

  if (Number.isInteger(employeeId)) {
    query += ' AND k.id = ?';
    params.push(employeeId);
  }

  query += ' GROUP BY k.id, k.nama, k.pin, g.nama_group';

  const [rows] = await pool.query(query, params);

  const bradfordData = rows.map((row) => {
    const scheduledDays = Number(row.scheduled_days ?? 0);
    const presentDays = Number(row.present_days ?? 0);
    const absentDays = scheduledDays - presentDays;

    // Calculate absence spells (simplified: each absent day is a spell)
    // In real implementation, consecutive absences should count as one spell
    const frequency = absentDays;
    const totalDays = absentDays;
    const bradfordScore = frequency * frequency * totalDays;

    return {
      employee_id: row.employee_id,
      nama: row.nama,
      pin: row.pin,
      group: row.group || 'Ungrouped',
      frequency,
      totalDays,
      bradfordScore,
    };
  });

  return bradfordData
    .filter((item) => item.bradfordScore > 0)
    .sort((a, b) => b.bradfordScore - a.bradfordScore)
    .slice(0, 20);
}

function calculateCheckInDistribution(rows) {
  const hourCounts = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));

  rows.forEach((row) => {
    if (row.masuk) {
      const [hours] = row.masuk.split(':').map(Number);
      if (!Number.isNaN(hours) && hours >= 0 && hours < 24) {
        hourCounts[hours].count++;
      }
    }
  });

  return hourCounts;
}

async function calculateWeeklyTrend(from, to, groupId, employeeId, allowedGroups, isAdmin, canFilterDeleted) {
  let query = `
    SELECT
      YEARWEEK(sc.tanggal, 1) AS year_week,
      DATE_FORMAT(MIN(sc.tanggal), '%Y-W%v') AS week,
      COUNT(DISTINCT CONCAT(k.id, '-', sc.tanggal)) AS scheduled,
      COUNT(DISTINCT CONCAT(sl.pin, '-', DATE(sl.scan_date))) AS present,
      SUM(CASE
        WHEN st.jam_masuk IS NOT NULL AND TIME(sl.scan_date) IS NOT NULL
          AND TIME(sl.scan_date) - st.jam_masuk <= '00:15:00'
        THEN 1 ELSE 0
      END) AS on_time,
      SUM(CASE
        WHEN st.jam_masuk IS NOT NULL AND TIME(sl.scan_date) IS NOT NULL
          AND TIME(sl.scan_date) - st.jam_masuk > '00:15:00'
        THEN 1 ELSE 0
      END) AS late
    FROM tb_schedule sc
    INNER JOIN tb_shift_type st ON st.id = sc.shift_id AND st.needs_scan = 1
    INNER JOIN tb_karyawan k ON k.id = sc.karyawan_id ${canFilterDeleted ? 'AND k.isDeleted = 0' : ''}
    LEFT JOIN tb_employee_group eg ON eg.karyawan_id = k.id
    LEFT JOIN tb_scanlog sl ON sl.pin = k.pin AND DATE(sl.scan_date) = sc.tanggal
    WHERE sc.tanggal BETWEEN ? AND ?
  `;

  const params = [from, to];

  if (!isAdmin && allowedGroups && allowedGroups.length > 0) {
    const placeholders = allowedGroups.map(() => '?').join(',');
    query += ` AND eg.group_id IN (${placeholders})`;
    params.push(...allowedGroups);
  }

  if (Number.isInteger(groupId)) {
    query += ' AND eg.group_id = ?';
    params.push(groupId);
  }

  if (Number.isInteger(employeeId)) {
    query += ' AND k.id = ?';
    params.push(employeeId);
  }

  query += ' GROUP BY year_week ORDER BY year_week';

  const [rows] = await pool.query(query, params);

  return rows.map((row) => {
    const scheduled = Number(row.scheduled ?? 0);
    const present = Number(row.present ?? 0);
    const onTime = Number(row.on_time ?? 0);
    const late = Number(row.late ?? 0);

    return {
      week: row.week,
      attendanceRate: scheduled > 0 ? Math.round((present / scheduled) * 10000) / 100 : 0,
      punctualityRate: present > 0 ? Math.round((onTime / present) * 10000) / 100 : 0,
      lateRate: present > 0 ? Math.round((late / present) * 10000) / 100 : 0,
    };
  });
}

function calculateDepartmentBreakdown(rows) {
  const groupMap = new Map();

  rows.forEach((row) => {
    const groupId = row.group_id ?? 'ungrouped';
    const groupName = row.nama_group || 'Ungrouped';

    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, {
        group_id: groupId,
        group_name: groupName,
        employees: new Set(),
        presentDays: 0,
        lateDays: 0,
        absentDays: 0,
        totalScheduled: 0,
      });
    }

    const group = groupMap.get(groupId);
    if (row.karyawan_id) {
      group.employees.add(row.karyawan_id);
    }

    const needsScan = Number(row.needs_scan ?? 1) === 1;
    if (!needsScan) return;

    group.totalScheduled++;

    if (row.scan_count > 0) {
      group.presentDays++;

      const scheduledIn = toMinutes(row.jam_masuk);
      const actualIn = toMinutes(row.masuk);

      if (scheduledIn !== null && actualIn !== null) {
        const lateMinutes = actualIn - scheduledIn;
        if (lateMinutes > LATE_THRESHOLD_MINUTES) {
          group.lateDays++;
        }
      }
    } else {
      group.absentDays++;
    }
  });

  return Array.from(groupMap.values()).map((group) => {
    const totalEmployees = group.employees.size;
    const attendanceRate = group.totalScheduled > 0
      ? Math.round((group.presentDays / group.totalScheduled) * 10000) / 100
      : 0;
    const punctualityRate = group.presentDays > 0
      ? Math.round(((group.presentDays - group.lateDays) / group.presentDays) * 10000) / 100
      : 0;

    return {
      group_id: group.group_id,
      group_name: group.group_name,
      totalEmployees,
      presentDays: group.presentDays,
      lateDays: group.lateDays,
      absentDays: group.absentDays,
      attendanceRate,
      punctualityRate,
    };
  }).sort((a, b) => a.group_name.localeCompare(b.group_name));
}

function calculateHeatmap(rows, from, to) {
  const employeeMap = new Map();
  const dateSet = new Set();
  const dataMap = new Map();

  // Generate all dates in range
  const dates = [];
  const start = new Date(from);
  const end = new Date(to);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    dates.push(dateStr);
    dateSet.add(dateStr);
  }

  rows.forEach((row) => {
    if (!row.karyawan_id) return;

    if (!employeeMap.has(row.karyawan_id)) {
      employeeMap.set(row.karyawan_id, {
        id: row.karyawan_id,
        nama: row.nama,
        pin: row.pin,
      });
    }

    const dateStr = String(row.scan_date).slice(0, 10);
    const key = `${row.karyawan_id}-${dateStr}`;

    const needsScan = Number(row.needs_scan ?? 1) === 1;
    let status = 'no_schedule';

    if (needsScan) {
      if (row.scan_count > 0) {
        const scheduledIn = toMinutes(row.jam_masuk);
        const actualIn = toMinutes(row.masuk);
        const scheduledOut = toMinutes(row.jam_keluar);
        const actualOut = toMinutes(row.keluar);

        let isLate = false;
        let isEarlyLeave = false;

        if (scheduledIn !== null && actualIn !== null) {
          const lateMinutes = actualIn - scheduledIn;
          if (lateMinutes > LATE_THRESHOLD_MINUTES) {
            isLate = true;
          }
        }

        const isNextDay = Number(row.next_day ?? 0) === 1;
        if (scheduledOut !== null && actualOut !== null && !isNextDay) {
          const earlyMinutes = scheduledOut - actualOut;
          if (earlyMinutes > LATE_THRESHOLD_MINUTES) {
            isEarlyLeave = true;
          }
        }

        if (isLate) {
          status = 'late';
        } else if (isEarlyLeave) {
          status = 'early_leave';
        } else {
          status = 'present';
        }
      } else {
        status = 'absent';
      }
    }

    dataMap.set(key, {
      employee_id: row.karyawan_id,
      date: dateStr,
      status,
    });
  });

  return {
    employees: Array.from(employeeMap.values()).sort((a, b) => a.nama.localeCompare(b.nama)),
    dates,
    data: Array.from(dataMap.values()),
  };
}
