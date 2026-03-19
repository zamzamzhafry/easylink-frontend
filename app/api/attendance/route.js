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

export async function GET(req) {
  // Auth gate: need at least one approved group or admin
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  const hasAttendanceAccess = auth.is_admin || auth.can_schedule || auth.can_dashboard;
  if (!hasAttendanceAccess) return forbiddenResponse('No attendance access.');

  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get('from') || new Date().toISOString().slice(0, 10);
  const dateTo = searchParams.get('to') || dateFrom;
  const pinFilter = searchParams.get('pin') || null;
  const groupId = searchParams.get('group_id') || null;
  const parsedGroupId = Number.parseInt(groupId ?? '', 10);
  const canFilterDeleted = await hasKaryawanColumn('isDeleted');
  const hasManualHours = await hasAttendanceNoteColumn('manual_hours');
  const hasManualApproved = await hasAttendanceNoteColumn('is_manual_approved');

  const allowedGroupIds = auth.is_admin
    ? null
    : auth.groups
        .filter((group) => group.can_schedule || group.can_dashboard)
        .map((group) => Number(group.group_id));

  if (!auth.is_admin && allowedGroupIds.length === 0) {
    return NextResponse.json([]);
  }

  if (
    !auth.is_admin &&
    Number.isInteger(parsedGroupId) &&
    !allowedGroupIds.includes(parsedGroupId)
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
        DATE(sl.scan_date) AS scan_date,
        MIN(TIME(sl.scan_date)) AS masuk,
        MAX(TIME(sl.scan_date)) AS keluar,
        COUNT(*) AS scan_count
      FROM tb_scanlog sl
      WHERE DATE(sl.scan_date) BETWEEN ? AND ?
  `;
  const params = [dateFrom, dateTo];

  if (pinFilter) {
    query += ' AND sl.pin = ?';
    params.push(pinFilter);
  }

  query += `
      GROUP BY sl.pin, DATE(sl.scan_date)
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

  const lateMinutesThreshold = 15;
  const result = rows.map((row) => {
    let status = row.note_status || 'normal';
    const flags = [];

    const scheduledInMinutes = toMinutes(row.jam_masuk);
    const actualInMinutes = toMinutes(row.masuk);
    if (scheduledInMinutes !== null && actualInMinutes !== null) {
      if (actualInMinutes - scheduledInMinutes > lateMinutesThreshold) {
        flags.push('terlambat');
        if (status === 'normal') status = 'terlambat';
      }
    }

    const scheduledOutMinutes = toMinutes(row.jam_keluar);
    const actualOutMinutes = toMinutes(row.keluar);
    if (scheduledOutMinutes !== null && actualOutMinutes !== null && !row.next_day) {
      if (scheduledOutMinutes - actualOutMinutes > lateMinutesThreshold) {
        flags.push('pulang_awal');
        if (status === 'normal') status = 'pulang_awal';
      }
    }

    let durationMinutes = null;
    if (actualInMinutes !== null && actualOutMinutes !== null && row.masuk !== row.keluar) {
      let diff = actualOutMinutes - actualInMinutes;
      if (diff < 0 && row.next_day) diff += 24 * 60;
      if (diff > 0) durationMinutes = diff;
    }

    const manualHours = Number(row.note_manual_hours || 0);
    const manualApproved = Boolean(Number(row.note_manual_approved || 0));
    if (manualHours > 0 && manualApproved) {
      durationMinutes = Math.round(manualHours * 60);
      flags.push('manual_adjustment');
      if (status === 'normal') status = 'reviewed';
    }

    const hasReview = Boolean(
      row.note_status || (row.note_catatan && String(row.note_catatan).trim())
    );
    const reviewedStatus = hasReview
      ? 'reviewed'
      : status !== 'normal'
        ? 'pending'
        : 'not_required';

    return {
      ...row,
      computed_status: status,
      flags,
      reviewed_status: reviewedStatus,
      has_review: hasReview ? 1 : 0,
      note_manual_hours: manualHours || null,
      note_manual_approved: manualApproved ? 1 : 0,
      durasi_menit: durationMinutes,
      durasi_label: durationMinutes
        ? `${Math.floor(durationMinutes / 60)}j ${durationMinutes % 60}m`
        : '-',
    };
  });

  return NextResponse.json(result);
}

// Update note/status for a scan entry
export async function POST(req) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin && !auth.is_leader) {
    return forbiddenResponse('Only admins and group leaders can add notes.');
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
