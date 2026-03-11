import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import {
  getAuthContextFromCookies,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/auth-session';

// ─────────────────────────────────────────────
// GET /api/users  — list all tb_user with scanlog counts + group access
// ─────────────────────────────────────────────
export async function GET(request) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin) return forbiddenResponse('Admin only');

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get('search') || '').trim();

  const whereClauses = [];
  const params = [];

  if (search) {
    whereClauses.push('(u.pin LIKE ? OR u.nama LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT
       u.pin,
       u.nama,
       u.rfid,
       u.privilege,
       COUNT(DISTINCT sl.scan_date) AS scan_days,
       COUNT(sl.pin)               AS scan_total,
       MAX(sl.scan_date)           AS last_scan
     FROM tb_user u
     LEFT JOIN tb_scanlog sl ON sl.pin = u.pin
     ${whereSQL}
     GROUP BY u.pin, u.nama, u.rfid, u.privilege
     ORDER BY u.nama, u.pin`,
    params
  );

  // Fetch group access per user in one query
  const [accessRows] = await pool.query(
    `SELECT uga.pin, uga.group_id, uga.can_schedule, uga.can_dashboard,
            uga.is_approved, uga.approved_by, uga.approved_at, uga.created_at,
            g.nama_group
     FROM tb_user_group_access uga
     LEFT JOIN tb_group g ON g.id = uga.group_id
     ORDER BY uga.pin, g.nama_group`
  );

  // Index access rows by pin
  const accessByPin = {};
  for (const row of accessRows) {
    const pin = String(row.pin);
    if (!accessByPin[pin]) accessByPin[pin] = [];
    accessByPin[pin].push({
      group_id: Number(row.group_id),
      nama_group: row.nama_group || null,
      can_schedule: Boolean(row.can_schedule),
      can_dashboard: Boolean(row.can_dashboard),
      is_approved: Boolean(row.is_approved),
      approved_by: row.approved_by || null,
      approved_at: row.approved_at || null,
      created_at: row.created_at || null,
    });
  }

  const users = rows.map((u) => ({
    pin: String(u.pin),
    nama: u.nama || null,
    rfid: u.rfid || null,
    privilege: Number(u.privilege ?? 0),
    scan_days: Number(u.scan_days ?? 0),
    scan_total: Number(u.scan_total ?? 0),
    last_scan: u.last_scan || null,
    groups: accessByPin[String(u.pin)] ?? [],
  }));

  return NextResponse.json({ ok: true, users });
}

// ─────────────────────────────────────────────
// POST /api/users  — create a new tb_user
// ─────────────────────────────────────────────
export async function POST(request) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin) return forbiddenResponse('Admin only');

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const pin = String(body.pin ?? '').trim();
  const nama = String(body.nama ?? '').trim();
  const pwd = String(body.pwd ?? '').trim();
  const rfid = String(body.rfid ?? '').trim();
  const privilege = Number(body.privilege ?? 0);

  if (!pin) return NextResponse.json({ ok: false, error: 'PIN is required' }, { status: 400 });
  if (!nama) return NextResponse.json({ ok: false, error: 'Name is required' }, { status: 400 });
  if (pin.length > 12)
    return NextResponse.json({ ok: false, error: 'PIN max 12 characters' }, { status: 400 });

  // Check duplicate
  const [existing] = await pool.query('SELECT pin FROM tb_user WHERE pin = ? LIMIT 1', [pin]);
  if (Array.isArray(existing) && existing.length > 0) {
    return NextResponse.json({ ok: false, error: `PIN ${pin} already exists` }, { status: 409 });
  }

  await pool.query('INSERT INTO tb_user (pin, nama, pwd, rfid, privilege) VALUES (?, ?, ?, ?, ?)', [
    pin,
    nama,
    pwd,
    rfid,
    privilege,
  ]);

  return NextResponse.json({ ok: true, pin });
}

// ─────────────────────────────────────────────
// PUT /api/users  — update a tb_user (body: { pin, nama?, pwd?, rfid?, privilege? })
// ─────────────────────────────────────────────
export async function PUT(request) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin) return forbiddenResponse('Admin only');

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const pin = String(body.pin ?? '').trim();
  if (!pin) return NextResponse.json({ ok: false, error: 'PIN is required' }, { status: 400 });

  // Check user exists
  const [existing] = await pool.query('SELECT pin FROM tb_user WHERE pin = ? LIMIT 1', [pin]);
  if (!Array.isArray(existing) || existing.length === 0) {
    return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
  }

  const setClauses = [];
  const params = [];

  if (body.nama !== undefined) {
    const nama = String(body.nama).trim();
    if (!nama)
      return NextResponse.json({ ok: false, error: 'Name cannot be empty' }, { status: 400 });
    setClauses.push('nama = ?');
    params.push(nama);
  }
  if (body.pwd !== undefined) {
    setClauses.push('pwd = ?');
    params.push(String(body.pwd));
  }
  if (body.rfid !== undefined) {
    setClauses.push('rfid = ?');
    params.push(String(body.rfid));
  }
  if (body.privilege !== undefined) {
    setClauses.push('privilege = ?');
    params.push(Number(body.privilege));
  }

  if (setClauses.length === 0) {
    return NextResponse.json({ ok: false, error: 'Nothing to update' }, { status: 400 });
  }

  params.push(pin);
  await pool.query(`UPDATE tb_user SET ${setClauses.join(', ')} WHERE pin = ?`, params);

  return NextResponse.json({ ok: true });
}

// ─────────────────────────────────────────────
// DELETE /api/users  — delete a tb_user (body: { pin })
// ─────────────────────────────────────────────
export async function DELETE(request) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin) return forbiddenResponse('Admin only');

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const pin = String(body.pin ?? '').trim();
  if (!pin) return NextResponse.json({ ok: false, error: 'PIN is required' }, { status: 400 });

  // Protect deleting yourself
  if (pin === auth.pin) {
    return NextResponse.json(
      { ok: false, error: 'Cannot delete your own account' },
      { status: 400 }
    );
  }

  const [existing] = await pool.query('SELECT pin FROM tb_user WHERE pin = ? LIMIT 1', [pin]);
  if (!Array.isArray(existing) || existing.length === 0) {
    return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 });
  }

  // Also delete group access entries
  await pool.query('DELETE FROM tb_user_group_access WHERE pin = ?', [pin]);
  await pool.query('DELETE FROM tb_user WHERE pin = ?', [pin]);

  return NextResponse.json({ ok: true });
}
