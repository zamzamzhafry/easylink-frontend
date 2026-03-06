// app/api/schedule/route.js
import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to   = searchParams.get('to');

  const [shifts] = await pool.query('SELECT * FROM tb_shift_type ORDER BY id');

  const [schedules] = await pool.query(`
    SELECT sc.id, sc.karyawan_id, sc.tanggal, sc.shift_id, sc.catatan,
           st.nama_shift, st.jam_masuk, st.jam_keluar, st.next_day, st.color_hex,
           COALESCE(k.nama, u.nama, k.pin) AS nama,
           k.pin,
           g.nama_group
    FROM tb_schedule sc
    JOIN tb_karyawan k   ON k.id  = sc.karyawan_id
    LEFT JOIN tb_user u  ON u.pin = k.pin
    JOIN tb_shift_type st ON st.id = sc.shift_id
    LEFT JOIN tb_employee_group eg ON eg.karyawan_id = k.id
    LEFT JOIN tb_group g ON g.id = eg.group_id
    WHERE sc.tanggal BETWEEN ? AND ?
      AND k.isDeleted = 0
    ORDER BY sc.tanggal, nama
  `, [from, to]);

  const [employees] = await pool.query(`
    SELECT k.id, COALESCE(k.nama, u.nama, k.pin) AS nama, k.pin,
           eg.group_id, g.nama_group
    FROM tb_karyawan k
    LEFT JOIN tb_user u ON u.pin = k.pin
    LEFT JOIN tb_employee_group eg ON eg.karyawan_id = k.id
    LEFT JOIN tb_group g ON g.id = eg.group_id
    WHERE k.isDeleted = 0
    ORDER BY nama
  `);

  return NextResponse.json({ shifts, schedules, employees });
}

export async function POST(req) {
  const body = await req.json();

  // Assign single shift
  if (body.action === 'set') {
    await pool.query(
      `INSERT INTO tb_schedule (karyawan_id, tanggal, shift_id, catatan)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE shift_id = VALUES(shift_id), catatan = VALUES(catatan)`,
      [body.karyawan_id, body.tanggal, body.shift_id, body.catatan ?? null]
    );
    return NextResponse.json({ ok: true });
  }

  // Bulk assign: group for a date range
  if (body.action === 'bulk_group') {
    const { group_id, shift_id, from, to } = body;
    const [members] = await pool.query(
      'SELECT karyawan_id FROM tb_employee_group WHERE group_id = ?', [group_id]
    );
    const dates = [];
    const cur = new Date(from);
    const end = new Date(to);
    while (cur <= end) { dates.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }

    for (const m of members) {
      for (const d of dates) {
        await pool.query(
          `INSERT INTO tb_schedule (karyawan_id, tanggal, shift_id)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE shift_id = VALUES(shift_id)`,
          [m.karyawan_id, d, shift_id]
        );
      }
    }
    return NextResponse.json({ ok: true, affected: members.length * dates.length });
  }

  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 });
}
