import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthContextFromCookies } from '@/lib/auth-session';

export async function POST(request, { params }) {
  try {
    const auth = await getAuthContextFromCookies();
    if (!auth || (!auth.is_admin && !auth.is_hr)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized to reject.' }, { status: 403 });
    }

    const { id } = params;
    const body = await request.json();
    const { note } = body;

    const connection = await pool.getConnection();

    await connection.query(`
      UPDATE tb_schedule_revision_requests 
      SET status = 'rejected', reviewed_by_karyawan_id = ?, reviewed_at = NOW(), review_note = ?
      WHERE id = ? AND status = 'pending'
    `, [auth.karyawan_id, note, id]);

    connection.release();
    return NextResponse.json({ ok: true, message: 'Rejected successfully.' });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
