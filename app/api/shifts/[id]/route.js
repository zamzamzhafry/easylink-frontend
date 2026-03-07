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

export async function PUT(req, { params }) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse('Login required.');
  if (!auth.is_admin) return forbiddenResponse('Only admin can edit shifts.');

  const shiftId = Number(params.id);
  if (!Number.isInteger(shiftId) || shiftId <= 0) {
    return validationError('Invalid shift id.');
  }

  const parsed = shiftPayloadSchema.safeParse(await req.json());
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message || 'Invalid shift payload.');
  }

  const payload = parsed.data;
  const columns = await getShiftColumns();
  const hasIcon = columns.has('icon_key');
  const hasActive = columns.has('is_active');

  const [[duplicate]] = await pool.query(
    `SELECT id
     FROM tb_shift_type
     WHERE LOWER(nama_shift) = LOWER(?)
       AND id <> ?
     LIMIT 1`,
    [payload.nama_shift, shiftId]
  );
  if (duplicate) {
    return validationError('Shift name already exists.');
  }

  const setParts = [
    'nama_shift = ?',
    'jam_masuk = ?',
    'jam_keluar = ?',
    'next_day = ?',
    'is_paid = ?',
    'jam_kerja = ?',
    'color_hex = ?',
    'needs_scan = ?',
  ];
  const values = [
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
    setParts.push('icon_key = ?');
    values.push(payload.icon_key);
  }
  if (hasActive) {
    setParts.push('is_active = ?');
    values.push(sqlBoolean(payload.is_active));
  }

  values.push(shiftId);

  await pool.query(
    `UPDATE tb_shift_type
     SET ${setParts.join(', ')}
     WHERE id = ?`,
    values
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req, { params }) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse('Login required.');
  if (!auth.is_admin) return forbiddenResponse('Only admin can delete shifts.');

  const shiftId = Number(params.id);
  if (!Number.isInteger(shiftId) || shiftId <= 0) {
    return validationError('Invalid shift id.');
  }

  const columns = await getShiftColumns();
  const hasActive = columns.has('is_active');

  const [[usage]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM tb_schedule
     WHERE shift_id = ?`,
    [shiftId]
  );
  if (Number(usage?.total || 0) > 0 && !hasActive) {
    return validationError(
      'Shift is already used by schedule rows. Add is_active column to deactivate instead.'
    );
  }

  if (hasActive) {
    await pool.query(
      `UPDATE tb_shift_type
       SET is_active = 0
       WHERE id = ?`,
      [shiftId]
    );
    return NextResponse.json({ ok: true, mode: 'deactivated' });
  }

  await pool.query('DELETE FROM tb_shift_type WHERE id = ?', [shiftId]);
  return NextResponse.json({ ok: true, mode: 'deleted' });
}


