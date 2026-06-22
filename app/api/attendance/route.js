export const dynamic = 'force-dynamic';
// app/api/attendance/route.js
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { hasKaryawanColumn } from '@/lib/karyawan-schema';
import {
  getAuthContextFromCookies,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/auth-session';
import {
  canAccessAttendance,
  canManageAttendanceNotes,
  canAccessRawAttendance,
  getAttendanceGroupIds,
} from '@/lib/authz/authorization-adapter';

function toMinutes(value) {
  if (!value || typeof value !== 'string') return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

async function hasAttendanceNoteColumn(columnName) {
  const [rows] = await pool.query(
    `
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tb_attendance_note'
        AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [columnName]
  );
  return rows.length > 0;
}

const PREDICTION_VIEW_MISSING_ERRORS = new Set([
  'ER_NO_SUCH_TABLE',
  'ER_NO_SUCH_VIEW',
  'ER_BAD_TABLE_ERROR',
  'ER_SP_DOES_NOT_EXIST',
]);

async function loadPredictionContextForPins(pins) {
  if (!pins.length) return new Map();
  const placeholders = pins.map(() => '?').join(',');
  try {
    const [predictionRows] = await pool.query(
      `SELECT * FROM vw_prediction_target_effective WHERE pin IN (${placeholders})`,
      pins
    );
    const contextMap = new Map();
    for (const row of predictionRows) {
      if (!row.pin || contextMap.has(row.pin)) continue;
      contextMap.set(row.pin, row);
    }
    return contextMap;
  } catch (error) {
    if (error && PREDICTION_VIEW_MISSING_ERRORS.has(error.code)) {
      return new Map();
    }
    throw error;
  }
}

function createCumulativeSummaryTemplate() {
  return {
    total_days: 0,
    total_scans: 0,
    late_days: 0,
    early_leave_days: 0,
    manual_adjustments: 0,
    reviewed_days: 0,
    pending_review_days: 0,
    total_duration_minutes: 0,
  };
}

function createInteractiveSummary() {
  return {
    on_time: 0,
    late: 0,
    early_leave: 0,
    anomaly: 0,
  };
}

function categorizeAttendanceEntry(entry) {
  const flags = Array.isArray(entry?.flags) ? entry.flags : [];
  const computedStatus = String(entry?.computed_status || '').toLowerCase();
  if (computedStatus === 'terlambat' || flags.includes('terlambat')) return 'late';
  if (computedStatus === 'pulang_awal' || flags.includes('pulang_awal')) return 'early_leave';
  if (computedStatus !== 'normal' || flags.length > 0) return 'anomaly';
  return 'on_time';
}

function buildInteractivePayload(rows, {
  auth,
  dateFrom,
  dateTo,
  drilldownStatus,
  drilldownGroup,
  groupId,
}) {
  const statusSummary = createInteractiveSummary();
  const grouped = new Map();

  for (const row of rows) {
    const category = categorizeAttendanceEntry(row);
    statusSummary[category] += 1;
    const groupName = row?.nama_group || 'Ungrouped';
    const groupEntry = grouped.get(groupName) ?? {
      category: groupName,
      total: 0,
      late: 0,
      early_leave: 0,
      anomaly: 0,
      on_time: 0,
      total_duration_minutes: 0,
      record_count: 0,
      target_contexts: new Map(),
    };
    groupEntry.total += 1;
    groupEntry.record_count += 1;
    groupEntry.total_duration_minutes += Number(row?.durasi_menit || 0);
    groupEntry[category] += 1;
    const prediction = row?.prediction_context;
    if (prediction && typeof prediction === 'object') {
      const targetHours = Number(
        prediction.minimum_hours ??
          prediction.minimumHours ??
          prediction.target_hours ??
          prediction.targetHours ??
          prediction.monthly_target_hours ??
          prediction.monthlyTargetHours
      );
      const yearMonth =
        prediction.year_month ?? prediction.yearMonth ?? prediction.month ?? prediction.period ?? null;
      const targetSource = prediction.target_source ?? prediction.targetSource ?? null;
      const key = `${yearMonth ?? 'unknown'}::${Number.isFinite(targetHours) ? targetHours : 'na'}::${targetSource ?? 'na'}`;
      if (!groupEntry.target_contexts.has(key)) {
        groupEntry.target_contexts.set(key, {
          year_month: yearMonth,
          minimum_hours: Number.isFinite(targetHours) ? targetHours : null,
          target_source: targetSource,
        });
      }
    }
    grouped.set(groupName, groupEntry);
  }

  const pie = Object.entries(statusSummary).map(([key, value]) => ({ key, name: key, value }));
  const barRows = [...grouped.values()]
    .map((groupEntry) => {
      const targetContexts = [...groupEntry.target_contexts.values()];
      const targetContext = targetContexts[0] ?? null;
      return {
        category: groupEntry.category,
        total: groupEntry.total,
        total_duration_minutes: groupEntry.total_duration_minutes,
        average_duration_minutes: groupEntry.record_count
          ? Math.round(groupEntry.total_duration_minutes / groupEntry.record_count)
          : 0,
        breakdown: {
          on_time: groupEntry.on_time,
          late: groupEntry.late,
          early_leave: groupEntry.early_leave,
          anomaly: groupEntry.anomaly,
        },
        prediction_context: targetContext
          ? {
              ...targetContext,
              has_mixed_targets: targetContexts.some(
                (item) =>
                  item.year_month !== targetContext.year_month ||
                  item.minimum_hours !== targetContext.minimum_hours ||
                  item.target_source !== targetContext.target_source
              ),
            }
          : null,
      };
    })
    .sort((left, right) => right.total - left.total || left.category.localeCompare(right.category));

  const filteredRows = rows.filter((row) => {
    if (drilldownStatus && categorizeAttendanceEntry(row) !== drilldownStatus) return false;
    if (drilldownGroup && String(row?.nama_group || 'Ungrouped') !== String(drilldownGroup)) return false;
    return true;
  });

  const drillRows = filteredRows.map((row) => ({
    date: row.scan_date,
    employee: row.nama,
    group: row.nama_group || 'Ungrouped',
    status: categorizeAttendanceEntry(row),
    schedule: [row.jam_masuk, row.jam_keluar].filter(Boolean).join(' - ') || '-',
    actual: [row.masuk, row.keluar].filter(Boolean).join(' - ') || '-',
    scans: Number(row.scan_count || 0),
    worked_minutes: Number(row.durasi_menit || 0),
    prediction_context: row.prediction_context ?? null,
  }));

  const availableGroups = [...new Set(rows.map((row) => String(row?.nama_group || 'Ungrouped')))].sort();
  const availableEmployees = [...new Map(rows.map((row) => [String(row?.pin || row?.karyawan_id || row?.nama), {
    id: row?.karyawan_id ?? row?.pin ?? null,
    pin: row?.pin ?? null,
    label: row?.nama || `PIN ${row?.pin ?? '-'}`,
  }])).values()];

  const predictionPayload = auth.is_admin
    ? null
    : rows.reduce((acc, row) => acc ?? row?.prediction_context ?? null, null);
  const cumulativePayload = auth.is_admin
    ? null
    : rows.reduce((acc, row) => acc ?? row?.cumulative_summary ?? null, null);

  return {
    rows,
    cumulative_summary: cumulativePayload,
    prediction_context: predictionPayload,
    interactive_report: {
      filters: {
        from: dateFrom,
        to: dateTo,
        group_id: groupId,
        drilldown_status: drilldownStatus,
        drilldown_group: drilldownGroup,
      },
      series: {
        pie,
        bar: barRows,
      },
      drilldown: {
        rows: drillRows,
        total: drillRows.length,
      },
      metadata: {
        totalRecords: rows.length,
        availableGroups,
        availableEmployees,
      },
    },
  };
}

export async function GET(req) {
  // Auth gate: need at least one approved group or admin
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!canAccessAttendance(auth)) return forbiddenResponse('No attendance access.');

  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get('from') || new Date().toISOString().slice(0, 10);
  const dateTo = searchParams.get('to') || dateFrom;
  const pinFilter = searchParams.get('pin') || null;
  const groupId = searchParams.get('group_id') || null;
  const parsedGroupId = Number.parseInt(groupId ?? '', 10);
  const reportingMode = searchParams.get('reporting') === 'interactive';
  const drilldownStatus = searchParams.get('drilldown_status') || null;
  const drilldownGroup = searchParams.get('drilldown_group') || null;
  const canFilterDeleted = await hasKaryawanColumn('isDeleted');
  const hasManualHours = await hasAttendanceNoteColumn('manual_hours');
  const hasManualApproved = await hasAttendanceNoteColumn('is_manual_approved');

  const allowedGroupIds = getAttendanceGroupIds(auth);
  const accessibleGroupIds = Array.isArray(allowedGroupIds) ? allowedGroupIds : [];

  if (!auth.is_admin && accessibleGroupIds.length === 0) {
    return NextResponse.json([]);
  }

  if (
    !auth.is_admin &&
    Number.isInteger(parsedGroupId) &&
    !accessibleGroupIds.includes(parsedGroupId)
  ) {
    return forbiddenResponse('This group is not in your access scope.');
  }

  // tb_scanlog uses one timestamp column (scan_date), so date/time are derived from it.
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
      sc.shift_id,
      st.nama_shift,
      st.jam_masuk,
      st.jam_keluar,
      st.next_day,
      st.needs_scan,
      st.color_hex,
      st.icon_key,
      an.status  AS note_status,
      an.catatan AS note_catatan,
      ${hasManualHours ? 'an.manual_hours' : 'NULL'} AS note_manual_hours,
      ${hasManualApproved ? 'an.is_manual_approved' : '0'} AS note_manual_approved
    FROM (
      SELECT
        sl.pin,
        DATE_FORMAT(sl.scan_date, '%Y-%m-%d') AS scan_date,
        MIN(TIME(sl.scan_date)) AS masuk,
        MAX(TIME(sl.scan_date)) AS keluar,
        COUNT(*) AS scan_count
      FROM tb_scanlog sl
      WHERE DATE_FORMAT(sl.scan_date, '%Y-%m-%d') BETWEEN ? AND ?
  `;
  const params = [dateFrom, dateTo];

  if (pinFilter) {
    query += ' AND sl.pin = ?';
    params.push(pinFilter);
  }

  query += `
      GROUP BY sl.pin, DATE_FORMAT(sl.scan_date, '%Y-%m-%d')
    ) logs
    LEFT JOIN tb_karyawan        k  ON k.pin  = logs.pin ${canFilterDeleted ? 'AND k.isDeleted = 0' : ''}
    LEFT JOIN tb_user            u  ON u.pin  = logs.pin
    LEFT JOIN tb_employee_group  eg ON eg.karyawan_id = k.id
    LEFT JOIN tb_group           g  ON g.id = eg.group_id
    LEFT JOIN tb_schedule        sc ON sc.karyawan_id = k.id AND sc.tanggal = logs.scan_date
    LEFT JOIN tb_shift_type      st ON st.id  = sc.shift_id
    LEFT JOIN tb_attendance_note an ON an.pin  = logs.pin AND an.tanggal = logs.scan_date
    WHERE 1 = 1
  `;

  // Determine which groups to filter by
  const groupsToFilter = auth.is_admin
    ? Number.isInteger(parsedGroupId)
      ? [parsedGroupId]
      : null
    : allowedGroupIds;

  if (groupsToFilter !== null && groupsToFilter.length) {
    if (groupsToFilter.length === 1) {
      query += ' AND eg.group_id = ?';
      params.push(groupsToFilter[0]);
    } else {
      query += ` AND eg.group_id IN (${groupsToFilter.map(() => '?').join(',')})`;
      params.push(...groupsToFilter);
    }
  }
  query += ' ORDER BY logs.scan_date DESC, nama ASC';

  const [rows] = await pool.query(query, params);

  const exposeReviewControls = auth.is_admin;
  const includeTeamPayload = !auth.is_admin;
  const pinList = Array.from(new Set(rows.map((row) => row.pin).filter(Boolean)));
  const predictionContextByPin = includeTeamPayload
    ? await loadPredictionContextForPins(pinList)
    : new Map();

  const lateMinutesThreshold = 15;
  const result = rows.map((row) => {
    const {
      note_manual_hours: rawManualHours = null,
      note_manual_approved: rawManualApproved = null,
      note_status: noteStatus = null,
      note_catatan: noteCatatan = null,
      ...rowBase
    } = row;
    const manualHours = Number(rawManualHours || 0);
    const manualApproved = Boolean(Number(rawManualApproved || 0));
    let status = noteStatus || 'normal';
    const flags = [];

    const scheduledInMinutes = toMinutes(rowBase.jam_masuk);
    const actualInMinutes = toMinutes(rowBase.masuk);
    if (scheduledInMinutes !== null && actualInMinutes !== null) {
      if (actualInMinutes - scheduledInMinutes > lateMinutesThreshold) {
        flags.push('terlambat');
        if (status === 'normal') status = 'terlambat';
      }
    }

    const scheduledOutMinutes = toMinutes(rowBase.jam_keluar);
    const actualOutMinutes = toMinutes(rowBase.keluar);
    if (scheduledOutMinutes !== null && actualOutMinutes !== null && !rowBase.next_day) {
      if (scheduledOutMinutes - actualOutMinutes > lateMinutesThreshold) {
        flags.push('pulang_awal');
        if (status === 'normal') status = 'pulang_awal';
      }
    }

    let durationMinutes = null;
    if (actualInMinutes !== null && actualOutMinutes !== null && rowBase.masuk !== rowBase.keluar) {
      let diff = actualOutMinutes - actualInMinutes;
      if (diff < 0 && rowBase.next_day) diff += 24 * 60;
      if (diff > 0) durationMinutes = diff;
    }

    if (manualHours > 0 && manualApproved) {
      durationMinutes = Math.round(manualHours * 60);
      flags.push('manual_adjustment');
      if (status === 'normal') status = 'reviewed';
    }

    const hasReview = Boolean(
      noteStatus || (noteCatatan && String(noteCatatan).trim())
    );
    const reviewedStatus = hasReview
      ? 'reviewed'
      : status !== 'normal'
        ? 'pending'
        : 'not_required';

    const entry = {
      ...rowBase,
      computed_status: status,
      flags,
      durasi_menit: durationMinutes,
      durasi_label: durationMinutes
        ? `${Math.floor(durationMinutes / 60)}j ${durationMinutes % 60}m`
        : '-',
    };

    if (exposeReviewControls) {
      entry.note_status = noteStatus;
      entry.note_catatan = noteCatatan;
      entry.reviewed_status = reviewedStatus;
      entry.has_review = hasReview ? 1 : 0;
      entry.note_manual_hours = manualHours || null;
      entry.note_manual_approved = manualApproved ? 1 : 0;
      entry.review_controls = {
        manual_hours: manualHours || null,
        manual_approved: manualApproved ? 1 : 0,
        manual_adjustment_applied: manualHours > 0 && manualApproved,
        has_manual_columns: Boolean(hasManualHours || hasManualApproved),
      };
    }

    return entry;
  });

  if (!includeTeamPayload) {
    return NextResponse.json(result);
  }

  const summaryByPin = new Map();
  for (const entry of result) {
    const pin = entry.pin;
    if (!pin) continue;
    const summary = summaryByPin.get(pin) ?? createCumulativeSummaryTemplate();
    summary.total_days += 1;
    summary.total_scans += Number(entry.scan_count || 0);
    if (entry.flags.includes('terlambat')) summary.late_days += 1;
    if (entry.flags.includes('pulang_awal')) summary.early_leave_days += 1;
    if (entry.flags.includes('manual_adjustment')) summary.manual_adjustments += 1;
    summary.total_duration_minutes += entry.durasi_menit || 0;
    if (entry.reviewed_status === 'reviewed') {
      summary.reviewed_days += 1;
    } else {
      summary.pending_review_days += 1;
    }
    summaryByPin.set(pin, summary);
  }

  const finalResult = result.map((entry) => {
    if (!entry.pin) {
      return {
        ...entry,
        cumulative_summary: null,
        prediction_context: null,
      };
    }
    const summary = summaryByPin.get(entry.pin) ?? null;
    const cumulativeSummary = summary
      ? {
          ...summary,
          average_duration_minutes: summary.total_days
            ? Math.round(summary.total_duration_minutes / summary.total_days)
            : null,
        }
      : null;
    return {
      ...entry,
      cumulative_summary: cumulativeSummary,
      prediction_context: predictionContextByPin.get(entry.pin) ?? null,
    };
  });

  if (!reportingMode) {
    return NextResponse.json(finalResult);
  }

  return NextResponse.json(
    buildInteractivePayload(finalResult, {
      auth,
      dateFrom,
      dateTo,
      drilldownStatus,
      drilldownGroup,
      groupId,
    })
  );
}

// Update note/status for a scan entry
export async function POST(req) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!canManageAttendanceNotes(auth) || !canAccessRawAttendance(auth)) {
    return forbiddenResponse('Only admins can add notes.');
  }
  const { pin, tanggal, status, catatan, manual_hours, manual_approved } = await req.json();
  const hasManualHours = await hasAttendanceNoteColumn('manual_hours');
  const hasManualApproved = await hasAttendanceNoteColumn('is_manual_approved');

  if (hasManualHours || hasManualApproved) {
    await pool.query(
      `INSERT INTO tb_attendance_note (
        pin, tanggal, status, catatan, updated_by,
        ${hasManualHours ? 'manual_hours,' : ''}
        ${hasManualApproved ? 'is_manual_approved,' : ''}
        updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ${hasManualHours ? '?,' : ''}
        ${hasManualApproved ? '?,' : ''}
        NOW()
      )
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        catatan = VALUES(catatan),
        updated_by = VALUES(updated_by),
        ${hasManualHours ? 'manual_hours = VALUES(manual_hours),' : ''}
        ${hasManualApproved ? 'is_manual_approved = VALUES(is_manual_approved),' : ''}
        updated_at = NOW()`,
      [
        pin,
        tanggal,
        status,
        catatan,
        auth.pin,
        ...(hasManualHours ? [manual_hours || null] : []),
        ...(hasManualApproved ? [manual_approved ? 1 : 0] : []),
      ]
    );
  } else {
    await pool.query(
      `INSERT INTO tb_attendance_note (pin, tanggal, status, catatan, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), catatan = VALUES(catatan), updated_by = VALUES(updated_by)`,
      [pin, tanggal, status, catatan, auth.pin]
    );
  }
  return NextResponse.json({ ok: true });
}
