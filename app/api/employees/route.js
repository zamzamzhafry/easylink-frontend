// app/api/employees/route.js
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getKaryawanColumns } from '@/lib/karyawan-schema';

export async function GET() {
  const columns = await getKaryawanColumns();
  const hasSoftDelete = columns.has('isDeleted');
  const hasActiveDuty = columns.has('isActiveDuty');

  const [rows] = await pool.query(`
    SELECT
      k.id,
      k.nama   AS nama_karyawan,
      k.pin,
      k.nip,
      k.awal_kontrak,
      k.akhir_kontrak,
      k.foto,
      ${hasActiveDuty ? 'k.isActiveDuty' : '1 AS isActiveDuty'},
      u.nama   AS nama_user,
      u.privilege
    FROM tb_karyawan k
    LEFT JOIN tb_user u ON u.pin = k.pin
    ${hasSoftDelete ? 'WHERE k.isDeleted = 0' : ''}
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
  const columns = await getKaryawanColumns();
  const hasSoftDelete = columns.has('isDeleted');
  const hasDeletedAt = columns.has('deletedAt');
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

  const insertColumns = ['nama', 'pin', 'nip', 'awal_kontrak', 'akhir_kontrak'];
  const insertValues = [namaKaryawan, userPin, nip, awalKontrak, akhirKontrak];
  if (hasActiveDuty) {
    insertColumns.push('isActiveDuty');
    insertValues.push(isActiveDuty);
  }
  if (hasSoftDelete) {
    insertColumns.push('isDeleted');
    insertValues.push(0);
  }
  if (hasDeletedAt) {
    insertColumns.push('deletedAt');
    insertValues.push(null);
  }

  const placeholders = insertColumns.map(() => '?').join(', ');
  const [result] = await pool.query(
    `INSERT INTO tb_karyawan (${insertColumns.join(', ')}) VALUES (${placeholders})`,
    insertValues
  );

  return NextResponse.json({ ok: true, id: result.insertId });
}
