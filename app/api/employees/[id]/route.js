export const dynamic = 'force-dynamic';
// app/api/employees/[id]/route.js
import { NextResponse } from 'next/server';
import {
  getAuthContextFromCookies,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/auth-session';
import pool from '@/lib/db';
import { getKaryawanColumns } from '@/lib/karyawan-schema';
import { z } from 'zod';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9._-]{1,50}$/;

const employeeUpdateSchema = z.object({
  nama_karyawan: z.string().min(1).max(100),
  user_pin: z.string().regex(IDENTIFIER_PATTERN).optional().or(z.literal('')),
  nip: z.string().regex(IDENTIFIER_PATTERN).optional().or(z.literal('')),
  awal_kontrak: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  akhir_kontrak: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  isActiveDuty: z.boolean().optional(),
});

const paramsSchema = z.object({
  id: z.string().regex(/^\d+$/),
});

export async function PUT(req, { params }) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse('Login required.');
  if (!auth.is_admin) return forbiddenResponse('Only admin can update employees.');

  const paramsResult = paramsSchema.safeParse(params);
  if (!paramsResult.success) {
    return NextResponse.json(
      { ok: false, error: 'Invalid input', details: paramsResult.error.errors },
      { status: 400 }
    );
  }

  const body = await req.json();
  const bodyResult = employeeUpdateSchema.safeParse(body);
  if (!bodyResult.success) {
    return NextResponse.json(
      { ok: false, error: 'Invalid input', details: bodyResult.error.errors },
      { status: 400 }
    );
  }

  const { id } = paramsResult.data;
  const namaKaryawan = bodyResult.data.nama_karyawan.trim();
  const userPin = bodyResult.data.user_pin?.trim() || null;
  const normalizedNip = bodyResult.data.nip?.trim() || null;
  const awalKontrak = bodyResult.data.awal_kontrak?.trim() || null;
  const akhirKontrak = bodyResult.data.akhir_kontrak?.trim() || null;
  const activeDuty = bodyResult.data.isActiveDuty ? 1 : 0;
  const columns = await getKaryawanColumns();
  const hasSoftDelete = columns.has('isDeleted');
  const hasActiveDuty = columns.has('isActiveDuty');

  if (userPin) {
    const [[foundUser]] = await pool.query('SELECT pin FROM tb_user WHERE pin = ?', [userPin]);
    if (!foundUser) {
      return NextResponse.json(
        { ok: false, error: 'Selected tb_user relation is invalid.' },
        { status: 400 }
      );
    }
  }

  const setParts = [
    'nama = ?',
    'pin = ?',
    'nip = ?',
    'awal_kontrak = ?',
    'akhir_kontrak = ?',
  ];
  const values = [namaKaryawan, userPin, normalizedNip, awalKontrak, akhirKontrak];
  if (hasActiveDuty) {
    setParts.push('isActiveDuty = ?');
    values.push(activeDuty);
  }
  values.push(id);

  await pool.query(
    `UPDATE tb_karyawan
     SET ${setParts.join(', ')}
     WHERE id = ? ${hasSoftDelete ? 'AND isDeleted = 0' : ''}`,
    values
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req, { params }) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse('Login required.');
  if (!auth.is_admin) return forbiddenResponse('Only admin can delete employees.');

  const paramsResult = paramsSchema.safeParse(params);
  if (!paramsResult.success) {
    return NextResponse.json(
      { ok: false, error: 'Invalid input', details: paramsResult.error.errors },
      { status: 400 }
    );
  }

  const { id } = paramsResult.data;
  const columns = await getKaryawanColumns();
  const hasSoftDelete = columns.has('isDeleted');
  const hasDeletedAt = columns.has('deletedAt');
  const hasActiveDuty = columns.has('isActiveDuty');

  if (!hasSoftDelete || !hasDeletedAt) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Soft delete columns are missing. Run employee_crud_revision.sql first.',
      },
      { status: 400 }
    );
  }

  const setParts = ['isDeleted = 1', 'deletedAt = NOW()'];
  if (hasActiveDuty) {
    setParts.push('isActiveDuty = 0');
  }
  await pool.query(
    `UPDATE tb_karyawan
     SET ${setParts.join(', ')}
     WHERE id = ? AND isDeleted = 0`,
    [id]
  );

  return NextResponse.json({ ok: true });
}

