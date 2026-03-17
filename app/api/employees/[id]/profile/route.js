import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import {
  getAuthContextFromCookies,
  unauthorizedResponse,
  forbiddenResponse,
  isAllowedGroup,
} from '@/lib/auth-session';
import { hasKaryawanColumn } from '@/lib/karyawan-schema';

/**
 * GET /api/employees/[id]/profile
 *
 * Returns for a single employee (by karyawan id):
 *   - employee  : tb_karyawan row + tb_user link
 *   - schedule  : all tb_schedule rows with shift info (last 90 days + next 30)
 *   - scanlogs  : tb_scanlog rows, NO karyawan join (pin-based), last 90 days
 *   - shiftStats: per-shift counts for penta/radar chart
 *
 * Auth:
 *   - Admin   → full access to anyone
 *   - Self    → the logged-in user whose tb_user.pin === tb_karyawan.pin (own profile)
 *   - Team    → user with group access to the employee's group (can_dashboard or can_schedule)
 *   - Others  → 403
 */
export async function GET(request, { params }) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();

  const karyawanId = parseInt(params.id, 10);
  if (!karyawanId || isNaN(karyawanId)) {
    return NextResponse.json({ ok: false, error: 'Invalid employee ID' }, { status: 400 });
  }

  // ── 1. Fetch employee row ────────────────────────────────────────────────────
  const hasDeleted = await hasKaryawanColumn('isDeleted');
  const hasActiveDuty = await hasKaryawanColumn('isActiveDuty');

  const [empRows] = await pool.query(
    `SELECT
       k.id,
       k.nama,
       k.pin,
       k.nip,
       k.awal_kontrak,
       k.akhir_kontrak,
       k.foto,
       ${hasDeleted ? 'k.isDeleted,' : '0 AS isDeleted,'}
       ${hasActiveDuty ? 'k.isActiveDuty,' : '1 AS isActiveDuty,'}
       u.nama   AS user_nama,
       u.rfid,
       u.privilege,
       g.id     AS group_id,
       g.nama_group
     FROM tb_karyawan k
     LEFT JOIN tb_user u ON u.pin = k.pin
     LEFT JOIN tb_employee_group eg ON eg.karyawan_id = k.id
     LEFT JOIN tb_group g ON g.id = eg.group_id
     WHERE k.id = ?
     LIMIT 1`,
    [karyawanId]
  );

  if (!Array.isArray(empRows) || empRows.length === 0) {
    return NextResponse.json({ ok: false, error: 'Employee not found' }, { status: 404 });
  }

  const emp = empRows[0];

  // ── 2. Auth check ────────────────────────────────────────────────────────────
  const isAdmin = Boolean(auth.is_admin);
  const isSelf = emp.pin && auth.pin === String(emp.pin);
  const isTeamMember =
    emp.group_id != null &&
    (isAllowedGroup(auth, emp.group_id, 'dashboard') ||
      isAllowedGroup(auth, emp.group_id, 'schedule'));

  if (!isAdmin && !isSelf && !isTeamMember) {
    return forbiddenResponse('Not authorized to view this profile');
  }

  // ── 3. Schedule: last 90 days + next 30 days ─────────────────────────────────
  const [scheduleRows] = await pool.query(
    `SELECT
       s.id,
       s.tanggal,
       s.shift_id,
       s.catatan,
       st.nama_shift,
       st.jam_masuk,
       st.jam_keluar,
       st.next_day,
       st.is_paid,
       st.color_hex,
       st.icon_key,
       st.needs_scan
     FROM tb_schedule s
     JOIN tb_shift_type st ON st.id = s.shift_id
     WHERE s.karyawan_id = ?
       AND s.tanggal BETWEEN DATE_SUB(CURDATE(), INTERVAL 90 DAY) AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
     ORDER BY s.tanggal DESC`,
    [karyawanId]
  );

  // ── 4. Scanlogs: last 90 days, pin-only (no karyawan join) ───────────────────
  const pin = emp.pin ? String(emp.pin) : null;
  let scanlogs = [];

  if (pin) {
    const [scanRows] = await pool.query(
      `SELECT
         DATE(sl.scan_date) AS scan_date,
         TIME(sl.scan_date) AS scan_time,
         sl.pin,
         sl.verifymode,
         sl.iomode,
         sl.workcode,
         sl.sn
       FROM tb_scanlog sl
       WHERE sl.pin = ?
         AND sl.scan_date >= DATE_SUB(NOW(), INTERVAL 90 DAY)
       ORDER BY sl.scan_date DESC
       LIMIT 2000`,
      [pin]
    );
    scanlogs = (Array.isArray(scanRows) ? scanRows : []).map((r) => ({
      scan_date: r.scan_date ? String(r.scan_date).slice(0, 10) : null,
      scan_time: r.scan_time ? String(r.scan_time).slice(0, 8) : null,
      pin: String(r.pin),
      verifymode: Number(r.verifymode ?? 0),
      iomode: Number(r.iomode ?? 0),
      workcode: Number(r.workcode ?? 0),
      sn: r.sn || '',
    }));
  }

  // ── 5. Shift statistics for penta/radar chart ────────────────────────────────
  // Count per shift name across ALL schedule history for this employee
  const [shiftStatRows] = await pool.query(
    `SELECT
       st.nama_shift,
       st.color_hex,
       st.icon_key,
       st.is_paid,
       COUNT(*) AS total
     FROM tb_schedule s
     JOIN tb_shift_type st ON st.id = s.shift_id
     WHERE s.karyawan_id = ?
     GROUP BY st.id, st.nama_shift, st.color_hex, st.icon_key, st.is_paid
     ORDER BY total DESC`,
    [karyawanId]
  );

  const shiftStats = (Array.isArray(shiftStatRows) ? shiftStatRows : []).map((r) => ({
    nama_shift: r.nama_shift,
    color_hex: r.color_hex || '#6B7280',
    icon_key: r.icon_key || null,
    is_paid: Boolean(r.is_paid),
    total: Number(r.total),
  }));

  // ── 6. Build response ────────────────────────────────────────────────────────
  const employee = {
    id: Number(emp.id),
    nama: emp.nama || null,
    pin: emp.pin ? String(emp.pin) : null,
    nip: emp.nip || null,
    awal_kontrak: emp.awal_kontrak || null,
    akhir_kontrak: emp.akhir_kontrak || null,
    foto: emp.foto || null,
    isDeleted: Boolean(emp.isDeleted),
    isActiveDuty: Boolean(emp.isActiveDuty),
    user_nama: emp.user_nama || null,
    rfid: emp.rfid || null,
    privilege: emp.privilege != null ? Number(emp.privilege) : null,
    group_id: emp.group_id != null ? Number(emp.group_id) : null,
    nama_group: emp.nama_group || null,
  };

  const schedule = (Array.isArray(scheduleRows) ? scheduleRows : []).map((r) => ({
    id: Number(r.id),
    tanggal: r.tanggal ? String(r.tanggal).slice(0, 10) : null,
    shift_id: Number(r.shift_id),
    catatan: r.catatan || null,
    nama_shift: r.nama_shift,
    jam_masuk: r.jam_masuk ? String(r.jam_masuk).slice(0, 5) : null,
    jam_keluar: r.jam_keluar ? String(r.jam_keluar).slice(0, 5) : null,
    next_day: Boolean(r.next_day),
    is_paid: Boolean(r.is_paid),
    color_hex: r.color_hex || '#6B7280',
    icon_key: r.icon_key || null,
    needs_scan: Boolean(r.needs_scan),
  }));

  return NextResponse.json({ ok: true, employee, schedule, scanlogs, shiftStats });
}
