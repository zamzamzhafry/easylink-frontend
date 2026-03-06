// app/api/attendance/route.js
import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get('from') || new Date().toISOString().slice(0,10);
  const dateTo   = searchParams.get('to')   || dateFrom;
  const pinFilter = searchParams.get('pin') || null;

  // Aggregate per employee per day: first scan = masuk, last scan = keluar
  let query = `
    SELECT
      sl.pin,
      sl.scan_date,
      MIN(sl.scan_time) AS masuk,
      MAX(sl.scan_time) AS keluar,
      COUNT(sl.id)      AS scan_count,
      COALESCE(k.nama, u.nama, sl.pin) AS nama,
      sc.shift_id,
      st.nama_shift,
      st.jam_masuk,
      st.jam_keluar,
      st.next_day,
      st.needs_scan,
      an.status  AS note_status,
      an.catatan AS note_catatan
    FROM tb_scanlog sl
    LEFT JOIN tb_karyawan        k  ON k.pin  = sl.pin
    LEFT JOIN tb_user            u  ON u.pin  = sl.pin
    LEFT JOIN tb_schedule        sc ON sc.karyawan_id = k.id AND sc.tanggal = sl.scan_date
    LEFT JOIN tb_shift_type      st ON st.id  = sc.shift_id
    LEFT JOIN tb_attendance_note an ON an.pin  = sl.pin AND an.tanggal = sl.scan_date
    WHERE sl.scan_date BETWEEN ? AND ?
  `;
  const params = [dateFrom, dateTo];

  if (pinFilter) {
    query += ' AND sl.pin = ?';
    params.push(pinFilter);
  }

  query += ' GROUP BY sl.pin, sl.scan_date ORDER BY sl.scan_date DESC, nama ASC';

  const [rows] = await pool.query(query, params);

  // Compute status per row
  const LATE_MINUTES = 15;
  const result = rows.map(r => {
    let status = r.note_status || 'normal';
    let flags  = [];

    if (r.jam_masuk && r.masuk) {
      const [sh, sm] = r.jam_masuk.split(':').map(Number);
      const [ah, am] = r.masuk.split(':').map(Number);
      const schedMins = sh * 60 + sm;
      const actualMins = ah * 60 + am;
      if (actualMins - schedMins > LATE_MINUTES) {
        flags.push('terlambat');
        if (status === 'normal') status = 'terlambat';
      }
    }

    if (r.jam_keluar && r.keluar && !r.next_day) {
      const [sh, sm] = r.jam_keluar.split(':').map(Number);
      const [ah, am] = r.keluar.split(':').map(Number);
      const schedMins = sh * 60 + sm;
      const actualMins = ah * 60 + am;
      if (schedMins - actualMins > LATE_MINUTES) {
        flags.push('pulang_awal');
        if (status === 'normal') status = 'pulang_awal';
      }
    }

    // Work duration in minutes
    let durasiMenit = null;
    if (r.masuk && r.keluar && r.masuk !== r.keluar) {
      const [mh, mm] = r.masuk.split(':').map(Number);
      const [kh, km] = r.keluar.split(':').map(Number);
      let diff = (kh * 60 + km) - (mh * 60 + mm);
      if (diff < 0 && r.next_day) diff += 24 * 60;
      if (diff > 0) durasiMenit = diff;
    }

    return {
      ...r,
      computed_status: status,
      flags,
      durasi_menit: durasiMenit,
      durasi_label: durasiMenit
        ? `${Math.floor(durasiMenit / 60)}j ${durasiMenit % 60}m`
        : '—',
    };
  });

  return NextResponse.json(result);
}

// Update note/status for a scan entry
export async function POST(req) {
  const { pin, tanggal, status, catatan, updated_by } = await req.json();
  await pool.query(
    `INSERT INTO tb_attendance_note (pin, tanggal, status, catatan, updated_by)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status = VALUES(status), catatan = VALUES(catatan), updated_by = VALUES(updated_by)`,
    [pin, tanggal, status, catatan, updated_by ?? 'operator']
  );
  return NextResponse.json({ ok: true });
}
