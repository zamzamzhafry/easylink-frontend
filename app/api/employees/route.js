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
      u.nama   AS nama_user,
      u.privilege
    FROM tb_karyawan k
    LEFT JOIN tb_user u ON u.pin = k.pin
    ORDER BY k.id ASC
  `);
  return NextResponse.json(rows);
}
