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
import { recordRoleChange } from '@/lib/auth-audit';

const LEADER_ROLE_KEY = 'group_leader';

async function resolveKaryawanIdByPin(pin) {
  if (pin === undefined || pin === null || pin === '') return null;
  const [rows] = await pool.query('SELECT id FROM tb_karyawan WHERE pin = ? LIMIT 1', [pin]);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const id = rows[0].id;
  return Number.isInteger(id) && id > 0 ? id : null;
}

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
  // Device table column probe kept only for the response flag the admin UI
  // still reads (has_leader_column). Leader source-of-truth now lives in
  // tb_karyawan_roles (Task 11 / H4), not tb_user_group_access.is_leader.
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

  const [leaderRows] = await pool.query(
    `SELECT
      r.group_id,
      r.karyawan_id,
      k.pin,
      k.nip,
      COALESCE(k.nama, u.nama, k.pin) AS nama,
      u.privilege
    FROM tb_karyawan_roles r
    JOIN tb_karyawan k ON k.id = r.karyawan_id
    LEFT JOIN tb_user u ON u.pin = k.pin
    WHERE r.role_key = ?
      AND r.group_id IS NOT NULL
      ${canFilterDeleted ? 'AND k.isDeleted = 0' : ''}
    ORDER BY r.group_id, nama, r.karyawan_id`,
    [LEADER_ROLE_KEY]
  );

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
    const targetKaryawanId = await resolveKaryawanIdByPin(body.pin);
    if (targetKaryawanId === null) {
      return NextResponse.json(
        { ok: false, error: 'No karyawan matches that pin.' },
        { status: 400 }
      );
    }

    // Source-of-truth write: karyawan_id-keyed group_leader role.
    // Multi-leader per group is allowed, so guard the INSERT on absence of
    // an identical (karyawan_id, group_leader, group_id) row.
    await pool.query(
      `INSERT INTO tb_karyawan_roles (karyawan_id, role_key, group_id)
       SELECT ?, ?, ?
       FROM DUAL
       WHERE NOT EXISTS (
         SELECT 1 FROM tb_karyawan_roles
         WHERE karyawan_id = ? AND role_key = ? AND group_id = ?
       )`,
      [
        targetKaryawanId,
        LEADER_ROLE_KEY,
        body.group_id,
        targetKaryawanId,
        LEADER_ROLE_KEY,
        body.group_id,
      ]
    );

    // Legacy device-table write retained as dead data only (machine/device
    // still writes here); never read back. Best-effort, column-gated.
    if (await hasGroupAccessColumn('is_leader')) {
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
    }

    await recordRoleChange({
      actorKaryawanId: auth.karyawan_id ?? null,
      targetKaryawanId,
      action: 'grant',
      roleKey: LEADER_ROLE_KEY,
      groupId: body.group_id ?? null,
    });

    return NextResponse.json({ ok: true });
  }

  if (body.action === 'remove_leader') {
    const targetKaryawanId = await resolveKaryawanIdByPin(body.pin);
    if (targetKaryawanId === null) {
      return NextResponse.json(
        { ok: false, error: 'No karyawan matches that pin.' },
        { status: 400 }
      );
    }

    // Source-of-truth revoke: drop the karyawan_id-keyed group_leader role.
    await pool.query(
      `DELETE FROM tb_karyawan_roles
       WHERE karyawan_id = ? AND role_key = ? AND group_id = ?`,
      [targetKaryawanId, LEADER_ROLE_KEY, body.group_id]
    );

    // Legacy device-table write retained as dead data only; never read back.
    if (await hasGroupAccessColumn('is_leader')) {
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
    }

    await recordRoleChange({
      actorKaryawanId: auth.karyawan_id ?? null,
      targetKaryawanId,
      action: 'revoke',
      roleKey: LEADER_ROLE_KEY,
      groupId: body.group_id ?? null,
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 });
}
