// app/api/schedule/route.js
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { hasKaryawanColumn } from '@/lib/karyawan-schema';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to   = searchParams.get('to');
  const canFilterDeleted = await hasKaryawanColumn('isDeleted');

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
      ${canFilterDeleted ? 'AND k.isDeleted = 0' : ''}
    ORDER BY sc.tanggal, nama
  `, [from, to]);

  const [employees] = await pool.query(`
    SELECT k.id, COALESCE(k.nama, u.nama, k.pin) AS nama, k.pin,
           eg.group_id, g.nama_group
    FROM tb_karyawan k
    LEFT JOIN tb_user u ON u.pin = k.pin
    LEFT JOIN tb_employee_group eg ON eg.karyawan_id = k.id
    LEFT JOIN tb_group g ON g.id = eg.group_id
    ${canFilterDeleted ? 'WHERE k.isDeleted = 0' : ''}
    ORDER BY nama
  `);

  return NextResponse.json({ shifts, schedules, employees });
}

export async function POST(req) {
  const body = await req.json();
  const canFilterDeleted = await hasKaryawanColumn('isDeleted');

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

  // Bulk upsert from validated import rows
  if (body.action === 'bulk_rows') {
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) {
      return NextResponse.json({ ok: false, error: 'No import rows provided.' }, { status: 400 });
    }

    const employeeIds = [...new Set(rows.map((row) => Number(row.karyawan_id)).filter(Boolean))];
    const shiftIds = [...new Set(rows.map((row) => Number(row.shift_id)).filter(Boolean))];
    if (!employeeIds.length || !shiftIds.length) {
      return NextResponse.json(
        { ok: false, error: 'Import rows must include valid employee IDs and shift IDs.' },
        { status: 400 }
      );
    }

    const [employees] = await pool.query(
      `SELECT id FROM tb_karyawan
       WHERE id IN (${employeeIds.map(() => '?').join(',')})
       ${canFilterDeleted ? 'AND isDeleted = 0' : ''}`,
      employeeIds
    );
    const [shifts] = await pool.query(
      `SELECT id FROM tb_shift_type WHERE id IN (${shiftIds.map(() => '?').join(',')})`,
      shiftIds
    );

    const employeeSet = new Set(employees.map((employee) => Number(employee.id)));
    const shiftSet = new Set(shifts.map((shift) => Number(shift.id)));

    let affected = 0;
    const skipped = [];
    for (const row of rows) {
      const employeeId = Number(row.karyawan_id);
      const shiftId = Number(row.shift_id);
      const tanggal = row.tanggal;

      if (!employeeSet.has(employeeId) || !shiftSet.has(shiftId) || !tanggal) {
        skipped.push(row);
        continue;
      }

      await pool.query(
        `INSERT INTO tb_schedule (karyawan_id, tanggal, shift_id, catatan)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE shift_id = VALUES(shift_id), catatan = VALUES(catatan)`,
        [employeeId, tanggal, shiftId, row.catatan ?? null]
      );
      affected += 1;
    }

    return NextResponse.json({ ok: true, affected, skipped: skipped.length });
  }

  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 });
}
