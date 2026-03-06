// app/api/groups/route.js
import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
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
           k.pin, k.nip
    FROM tb_employee_group eg
    JOIN tb_karyawan k ON k.id = eg.karyawan_id
    LEFT JOIN tb_user u ON u.pin = k.pin
    WHERE k.isDeleted = 0
    ORDER BY nama
  `);

  // employees not yet in any group
  const [unassigned] = await pool.query(`
    SELECT k.id, COALESCE(k.nama, u.nama, k.pin) AS nama, k.pin, k.nip
    FROM tb_karyawan k
    LEFT JOIN tb_user u ON u.pin = k.pin
    LEFT JOIN tb_employee_group eg ON eg.karyawan_id = k.id
    WHERE eg.karyawan_id IS NULL AND k.isDeleted = 0
    ORDER BY nama
  `);

  return NextResponse.json({ groups, members, unassigned });
}

export async function POST(req) {
  const body = await req.json();

  // Create group
  if (body.action === 'create_group') {
    const [res] = await pool.query(
      'INSERT INTO tb_group (nama_group, deskripsi) VALUES (?, ?)',
      [body.nama_group, body.deskripsi ?? null]
    );
    return NextResponse.json({ ok: true, id: res.insertId });
  }

  // Assign employee to group
  if (body.action === 'assign') {
    await pool.query(
      `INSERT INTO tb_employee_group (karyawan_id, group_id) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE group_id = VALUES(group_id)`,
      [body.karyawan_id, body.group_id]
    );
    return NextResponse.json({ ok: true });
  }

  // Remove employee from group
  if (body.action === 'remove') {
    await pool.query('DELETE FROM tb_employee_group WHERE karyawan_id = ?', [body.karyawan_id]);
    return NextResponse.json({ ok: true });
  }

  // Update group
  if (body.action === 'update_group') {
    await pool.query(
      'UPDATE tb_group SET nama_group = ?, deskripsi = ? WHERE id = ?',
      [body.nama_group, body.deskripsi ?? null, body.id]
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 });
}
