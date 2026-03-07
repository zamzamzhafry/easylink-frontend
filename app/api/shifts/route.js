export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { shiftPayloadSchema, normalizeTimeDb } from '@/lib/shift-schema';
import {
  forbiddenResponse,
  getAuthContextFromCookies,
  unauthorizedResponse,
} from '@/lib/auth-session';
import pool from '@/lib/db';
import { getShiftColumns } from '@/lib/shift-table-schema';

function validationError(message) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

function sqlBoolean(value) {
  return value ? 1 : 0;
}

export async function GET() {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse('Login required.');
  if (!auth.is_admin) return forbiddenResponse('Only admin can manage shifts.');

  const columns = await getShiftColumns();
  const hasIcon = columns.has('icon_key');
  const hasActive = columns.has('is_active');

  const [rows] = await pool.query(`
    SELECT
      id,
      nama_shift,
      jam_masuk,
      jam_keluar,
      next_day,
      is_paid,
      jam_kerja,
      color_hex,
      needs_scan,
      ${hasIcon ? 'icon_key' : 'NULL AS icon_key'},
      ${hasActive ? 'is_active' : '1 AS is_active'}
    FROM tb_shift_type
    ORDER BY ${hasActive ? 'is_active DESC,' : ''} id ASC
  `);

  return NextResponse.json({ ok: true, rows });
}

export async function POST(req) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse('Login required.');
  if (!auth.is_admin) return forbiddenResponse('Only admin can create shifts.');

  const parsed = shiftPayloadSchema.safeParse(await req.json());
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message || 'Invalid shift payload.');
  }

  const payload = parsed.data;
  const columns = await getShiftColumns();
  const hasIcon = columns.has('icon_key');
  const hasActive = columns.has('is_active');

  const [[existing]] = await pool.query(
    `SELECT id
     FROM tb_shift_type
     WHERE LOWER(nama_shift) = LOWER(?)
     LIMIT 1`,
    [payload.nama_shift]
  );
  if (existing) {
    return validationError('Shift name already exists.');
  }

  const insertColumns = [
    'nama_shift',
    'jam_masuk',
    'jam_keluar',
    'next_day',
    'is_paid',
    'jam_kerja',
    'color_hex',
    'needs_scan',
  ];
  const insertValues = [
    payload.nama_shift,
    normalizeTimeDb(payload.jam_masuk),
    normalizeTimeDb(payload.jam_keluar),
    sqlBoolean(payload.next_day),
    sqlBoolean(payload.is_paid),
    payload.jam_kerja,
    payload.color_hex,
    sqlBoolean(payload.needs_scan),
  ];

  if (hasIcon) {
    insertColumns.push('icon_key');
    insertValues.push(payload.icon_key);
  }
  if (hasActive) {
    insertColumns.push('is_active');
    insertValues.push(sqlBoolean(payload.is_active));
  }

  const placeholders = insertColumns.map(() => '?').join(', ');
  const [result] = await pool.query(
    `INSERT INTO tb_shift_type (${insertColumns.join(', ')})
     VALUES (${placeholders})`,
    insertValues
  );

  return NextResponse.json({ ok: true, id: result.insertId });
}


