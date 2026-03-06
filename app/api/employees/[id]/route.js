// app/api/employees/[id]/route.js
import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function PUT(req, { params }) {
  const { id } = params;
  const { nama_karyawan, user_pin, nip, awal_kontrak, akhir_kontrak, isActiveDuty } = await req.json();
  const namaKaryawan = nama_karyawan?.trim();
  const userPin = user_pin?.trim() || null;
  const normalizedNip = nip?.trim() || null;
  const awalKontrak = awal_kontrak?.trim() || null;
  const akhirKontrak = akhir_kontrak?.trim() || null;
  const activeDuty = isActiveDuty ? 1 : 0;

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

  await pool.query(
    `UPDATE tb_karyawan
     SET nama = ?, pin = ?, nip = ?, awal_kontrak = ?, akhir_kontrak = ?, isActiveDuty = ?
     WHERE id = ? AND isDeleted = 0`,
    [namaKaryawan, userPin, normalizedNip, awalKontrak, akhirKontrak, activeDuty, id]
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req, { params }) {
  const { id } = params;

  await pool.query(
    `UPDATE tb_karyawan
     SET isDeleted = 1,
         deletedAt = NOW(),
         isActiveDuty = 0
     WHERE id = ? AND isDeleted = 0`,
    [id]
  );

  return NextResponse.json({ ok: true });
}
