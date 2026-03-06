// app/api/employees/route.js
import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  const [rows] = await pool.query(`
    SELECT
      k.id,
      k.nama   AS nama_karyawan,
      k.pin,
      k.nip,
      k.awal_kontrak,
      k.akhir_kontrak,
      k.foto,
      k.isActiveDuty,
      u.nama   AS nama_user,
      u.privilege
    FROM tb_karyawan k
    LEFT JOIN tb_user u ON u.pin = k.pin
    WHERE k.isDeleted = 0
    ORDER BY k.id ASC
  `);
  return NextResponse.json(rows);
}

export async function POST(req) {
  const body = await req.json();
  const namaKaryawan = body.nama_karyawan?.trim();
  const userPin = body.user_pin?.trim() || null;
  const nip = body.nip?.trim() || null;
  const awalKontrak = body.awal_kontrak?.trim() || null;
  const akhirKontrak = body.akhir_kontrak?.trim() || null;
  const isActiveDuty = body.isActiveDuty ? 1 : 0;

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

  const [result] = await pool.query(
    `INSERT INTO tb_karyawan
      (nama, pin, nip, awal_kontrak, akhir_kontrak, isActiveDuty, isDeleted, deletedAt)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
    [namaKaryawan, userPin, nip, awalKontrak, akhirKontrak, isActiveDuty]
  );

  return NextResponse.json({ ok: true, id: result.insertId });
}
