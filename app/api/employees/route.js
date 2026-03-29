export const dynamic = 'force-dynamic';
// app/api/employees/route.js
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getKaryawanColumns } from '@/lib/karyawan-schema';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9._-]{1,50}$/;

function normalizeIdentifier(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function isValidIdentifier(value) {
  if (!value) return true;
  return IDENTIFIER_PATTERN.test(value);
}

function resolveLoginNip(nip, pin) {
  return nip || pin || null;
}

export async function GET() {
  const columns = await getKaryawanColumns();
  const hasSoftDelete = columns.has('isDeleted');
  const hasActiveDuty = columns.has('isActiveDuty');

  const [rows] = await pool.query(`
    SELECT
      k.id,
      k.nama AS nama_karyawan,
      k.pin,
      COALESCE(ka.nip, k.nip) AS nip,
      k.awal_kontrak,
      k.akhir_kontrak,
      k.foto,
      ${hasActiveDuty ? 'k.isActiveDuty' : '1 AS isActiveDuty'},
      COALESCE(k.nama, ka.nip) AS nama_user,
      CASE WHEN admin_role.karyawan_id IS NULL THEN 0 ELSE 14 END AS privilege
    FROM tb_karyawan k
    LEFT JOIN tb_karyawan_auth ka ON ka.karyawan_id = k.id
    LEFT JOIN (
      SELECT DISTINCT karyawan_id
      FROM tb_karyawan_roles
      WHERE role_key = 'admin'
    ) admin_role ON admin_role.karyawan_id = k.id
    ${hasSoftDelete ? 'WHERE k.isDeleted = 0' : ''}
    ORDER BY k.id ASC
  `);

  return NextResponse.json(rows);
}

export async function POST(req) {
  const body = await req.json();
  const namaKaryawan = body.nama_karyawan?.trim();
  const userPin = normalizeIdentifier(body.user_pin);
  const nip = normalizeIdentifier(body.nip);
  const awalKontrak = body.awal_kontrak?.trim() || null;
  const akhirKontrak = body.akhir_kontrak?.trim() || null;
  const isActiveDuty = body.isActiveDuty ? 1 : 0;
  const columns = await getKaryawanColumns();
  const hasSoftDelete = columns.has('isDeleted');
  const hasDeletedAt = columns.has('deletedAt');
  const hasActiveDuty = columns.has('isActiveDuty');

  if (!namaKaryawan) {
    return NextResponse.json({ ok: false, error: 'nama_karyawan is required.' }, { status: 400 });
  }

  if (!isValidIdentifier(userPin)) {
    return NextResponse.json(
      { ok: false, error: 'user_pin must use only letters, numbers, dot, underscore, or dash.' },
      { status: 400 }
    );
  }

  if (!isValidIdentifier(nip)) {
    return NextResponse.json(
      { ok: false, error: 'nip must use only letters, numbers, dot, underscore, or dash.' },
      { status: 400 }
    );
  }

  const loginNip = resolveLoginNip(nip, userPin);
  if (!loginNip) {
    return NextResponse.json(
      {
        ok: false,
        error: 'At least one identifier is required (nip or user_pin) for employee auth.',
      },
      { status: 400 }
    );
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existingAuth] = await connection.query(
      'SELECT karyawan_id FROM tb_karyawan_auth WHERE nip = ? LIMIT 1',
      [loginNip]
    );
    if (Array.isArray(existingAuth) && existingAuth.length > 0) {
      await connection.rollback();
      return NextResponse.json(
        { ok: false, error: 'Employee auth identity (NIP) already exists.' },
        { status: 409 }
      );
    }

    const insertColumns = ['nama', 'pin', 'nip', 'awal_kontrak', 'akhir_kontrak'];
    const insertValues = [namaKaryawan, userPin, loginNip, awalKontrak, akhirKontrak];

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
    const [result] = await connection.query(
      `INSERT INTO tb_karyawan (${insertColumns.join(', ')}) VALUES (${placeholders})`,
      insertValues
    );
    const employeeId = Number(result.insertId);

    await connection.query(
      `INSERT INTO tb_karyawan_auth
        (karyawan_id, nip, password_hash, is_active)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        nip = VALUES(nip),
        password_hash = CASE
          WHEN VALUES(password_hash) = '' THEN password_hash
          ELSE VALUES(password_hash)
        END,
        is_active = VALUES(is_active),
        updated_at = CURRENT_TIMESTAMP`,
      [employeeId, loginNip, '', 0]
    );

    await connection.commit();
    return NextResponse.json({ ok: true, id: employeeId });
  } catch (error) {
    await connection.rollback();
    if (error && (error.code === 'ER_DUP_ENTRY' || error.errno === 1062)) {
      return NextResponse.json(
        { ok: false, error: 'NIP already exists for another employee identity.' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}
