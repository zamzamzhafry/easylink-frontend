export const dynamic = 'force-dynamic';
// app/api/groups/route.js
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { hasKaryawanColumn } from '@/lib/karyawan-schema';
import {
  forbiddenResponse,
  getAuthContextFromCookies,
  unauthorizedResponse,
} from '@/lib/auth-session';

const schemaCache = new Map();

async function hasGroupAccessColumn(columnName) {
  if (schemaCache.has(columnName)) return schemaCache.get(columnName) === true;
  const [rows] = await pool.query(
    `SELECT 1 AS found
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'tb_user_group_access'
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [columnName]
  );
  const exists = Array.isArray(rows) && rows.length > 0;
  schemaCache.set(columnName, exists);
  return exists;
}

async function requireAdmin() {
  const auth = await getAuthContextFromCookies();
  if (!auth) return { error: unauthorizedResponse('Login required.') };
  if (!auth.is_admin) return { error: forbiddenResponse('Admin only.') };
  return { auth };
}

export async function GET() {
  const authCheck = await requireAdmin();
  if (authCheck.error) return authCheck.error;

  const canFilterDeleted = await hasKaryawanColumn('isDeleted');
  const hasLeader = await hasGroupAccessColumn('is_leader');

  const [groups] = await pool.query(`
    SELECT g.id, g.nama_group, g.deskripsi,
           COUNT(eg.karyawan_id) AS member_count
    FROM tb_group g
    LEFT JOIN tb_employee_group eg ON eg.group_id = g.id
    GROUP BY g.id ORDER BY g.id
  `);

  const [members] = await pool.query(`
    SELECT eg.karyawan_id, eg.group_id,
           COALESCE(k.nama, u.nama, k.pin) AS nama,
           k.pin, k.nip,
           u.privilege
    FROM tb_employee_group eg
    JOIN tb_karyawan k ON k.id = eg.karyawan_id
    LEFT JOIN tb_user u ON u.pin = k.pin
    ${canFilterDeleted ? 'WHERE k.isDeleted = 0' : ''}
    ORDER BY nama
  `);

  const [unassigned] = await pool.query(`
    SELECT k.id, COALESCE(k.nama, u.nama, k.pin) AS nama, k.pin, k.nip, u.privilege
    FROM tb_karyawan k
    LEFT JOIN tb_user u ON u.pin = k.pin
    LEFT JOIN tb_employee_group eg ON eg.karyawan_id = k.id
    WHERE eg.karyawan_id IS NULL ${canFilterDeleted ? 'AND k.isDeleted = 0' : ''}
    ORDER BY nama
  `);

  const [leaderCandidates] = await pool.query(`
    SELECT DISTINCT
      eg.group_id,
      u.pin,
      u.nama,
      u.privilege,
      k.id AS karyawan_id,
      COALESCE(k.nama, u.nama, u.pin) AS nama_karyawan
    FROM tb_employee_group eg
    JOIN tb_karyawan k ON k.id = eg.karyawan_id
    JOIN tb_user u ON u.pin = k.pin
    ${canFilterDeleted ? 'WHERE k.isDeleted = 0' : ''}
    ORDER BY eg.group_id, nama_karyawan
  `);

  const leaders = hasLeader
    ? await pool.query(`
        SELECT
          uga.group_id,
          uga.pin,
          u.nama,
          u.privilege,
          uga.can_schedule,
          uga.can_dashboard,
          uga.is_approved
        FROM tb_user_group_access uga
        LEFT JOIN tb_user u ON u.pin = uga.pin
        WHERE uga.is_leader = 1
          AND uga.is_approved = 1
        ORDER BY uga.group_id, u.nama, uga.pin
      `)
    : [[]];

  const leaderRows = Array.isArray(leaders[0]) ? leaders[0] : [];

  return NextResponse.json({
    groups,
    members,
    unassigned,
    leaders: leaderRows,
    leader_candidates: leaderCandidates,
    has_leader_column: hasLeader,
  });
}

export async function POST(req) {
  const authCheck = await requireAdmin();
  if (authCheck.error) return authCheck.error;

  const { auth } = authCheck;
  const body = await req.json();

  if (body.action === 'create_group') {
    const [res] = await pool.query('INSERT INTO tb_group (nama_group, deskripsi) VALUES (?, ?)', [
      body.nama_group,
      body.deskripsi ?? null,
    ]);
    return NextResponse.json({ ok: true, id: res.insertId });
  }

  if (body.action === 'assign') {
    await pool.query(
      `INSERT INTO tb_employee_group (karyawan_id, group_id) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE group_id = VALUES(group_id)`,
      [body.karyawan_id, body.group_id]
    );
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'remove') {
    await pool.query('DELETE FROM tb_employee_group WHERE karyawan_id = ?', [body.karyawan_id]);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'update_group') {
    await pool.query('UPDATE tb_group SET nama_group = ?, deskripsi = ? WHERE id = ?', [
      body.nama_group,
      body.deskripsi ?? null,
      body.id,
    ]);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'delete_group') {
    await pool.query('DELETE FROM tb_employee_group WHERE group_id = ?', [body.id]);
    await pool.query('DELETE FROM tb_user_group_access WHERE group_id = ?', [body.id]);
    await pool.query('DELETE FROM tb_group WHERE id = ?', [body.id]);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'assign_leader') {
    const hasLeader = await hasGroupAccessColumn('is_leader');
    if (!hasLeader) {
      return NextResponse.json(
        { ok: false, error: 'Column is_leader is missing. Run ALTER TABLE migration first.' },
        { status: 400 }
      );
    }

    await pool.query(
      `INSERT INTO tb_user_group_access
        (pin, group_id, can_schedule, can_dashboard, is_leader, is_approved, approved_by, approved_at)
       VALUES (?, ?, 1, 1, 1, 1, ?, NOW())
       ON DUPLICATE KEY UPDATE
         can_schedule = 1,
         can_dashboard = 1,
         is_leader = 1,
         is_approved = 1,
         approved_by = VALUES(approved_by),
         approved_at = VALUES(approved_at)`,
      [body.pin, body.group_id, auth.pin]
    );

    return NextResponse.json({ ok: true });
  }

  if (body.action === 'remove_leader') {
    const hasLeader = await hasGroupAccessColumn('is_leader');
    if (!hasLeader) {
      return NextResponse.json(
        { ok: false, error: 'Column is_leader is missing. Run ALTER TABLE migration first.' },
        { status: 400 }
      );
    }

    await pool.query(
      `UPDATE tb_user_group_access
       SET is_leader = 0,
           can_schedule = 0,
           can_dashboard = 1,
           is_approved = 1,
           approved_by = ?,
           approved_at = NOW()
       WHERE pin = ? AND group_id = ?`,
      [auth.pin, body.pin, body.group_id]
    );

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 });
}
