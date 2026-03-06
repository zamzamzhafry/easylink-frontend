// app/api/employees/[id]/route.js
import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function PUT(req, { params }) {
  const { id } = params;
  const { nama_karyawan, nama_user, nip, awal_kontrak, akhir_kontrak } = await req.json();

  // Update tb_karyawan
  await pool.query(
    `UPDATE tb_karyawan SET nama = ?, nip = ?, awal_kontrak = ?, akhir_kontrak = ? WHERE id = ?`,
    [nama_karyawan, nip, awal_kontrak, akhir_kontrak, id]
  );

  // Sync tb_user if pin exists
  if (nama_user !== undefined) {
    const [[k]] = await pool.query(`SELECT pin FROM tb_karyawan WHERE id = ?`, [id]);
    if (k?.pin) {
      await pool.query(
        `UPDATE tb_user SET nama = ? WHERE pin = ?`,
        [nama_user, k.pin]
      );
    }
  }

  return NextResponse.json({ ok: true });
}
