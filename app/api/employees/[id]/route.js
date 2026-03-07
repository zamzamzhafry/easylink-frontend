export const dynamic = 'force-dynamic';
// app/api/employees/[id]/route.js
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getKaryawanColumns } from '@/lib/karyawan-schema';

export async function PUT(req, { params }) {
  const { id } = params;
  const { nama_karyawan, user_pin, nip, awal_kontrak, akhir_kontrak, isActiveDuty } = await req.json();
  const namaKaryawan = nama_karyawan?.trim();
  const userPin = user_pin?.trim() || null;
  const normalizedNip = nip?.trim() || null;
  const awalKontrak = awal_kontrak?.trim() || null;
  const akhirKontrak = akhir_kontrak?.trim() || null;
  const activeDuty = isActiveDuty ? 1 : 0;
  const columns = await getKaryawanColumns();
  const hasSoftDelete = columns.has('isDeleted');
  const hasActiveDuty = columns.has('isActiveDuty');

  if (!namaKaryawan) {
    return NextResponse.json(
      { ok: false, error: 'nama_karyawan is required.' },
      { status: 400 }
    );
  }

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
  const { id } = params;
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

