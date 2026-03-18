export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { hasKaryawanColumn } from '@/lib/karyawan-schema';
import {
  getAuthContextFromCookies,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/auth-session';

export async function GET(req) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin) return forbiddenResponse('Admin only.');

  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get('from') || new Date().toISOString().slice(0, 10);
  const dateTo = searchParams.get('to') || dateFrom;
  const groupId = searchParams.get('group_id') || null;
  const parsedGroupId = Number.parseInt(groupId ?? '', 10);
  const requestedLimit = Number.parseInt(searchParams.get('limit') || '500', 10);
  const limit =
    Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 5000) : 500;
  const canFilterDeleted = await hasKaryawanColumn('isDeleted');

  let query = `
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
    FROM tb_scanlog sl
    LEFT JOIN tb_karyawan       k  ON k.pin = sl.pin ${canFilterDeleted ? 'AND k.isDeleted = 0' : ''}
    LEFT JOIN tb_user           u  ON u.pin = sl.pin
    LEFT JOIN tb_employee_group eg ON eg.karyawan_id = k.id
    LEFT JOIN tb_group          g  ON g.id = eg.group_id
    LEFT JOIN tb_attendance_note an ON an.pin = sl.pin AND an.tanggal = DATE(sl.scan_date)
    WHERE DATE(sl.scan_date) BETWEEN ? AND ?
  `;
  const params = [dateFrom, dateTo];

  if (Number.isInteger(parsedGroupId)) {
    query += ' AND eg.group_id = ?';
    params.push(parsedGroupId);
  }

  query += ' ORDER BY sl.scan_date DESC LIMIT ?';
  params.push(limit);

  const [rows] = await pool.query(query, params);
  return NextResponse.json(rows);
}
