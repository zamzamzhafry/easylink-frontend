import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthContextFromCookies } from '@/lib/auth-session';

export async function POST(request, { params }) {
  try {
    const auth = await getAuthContextFromCookies();
    if (!auth || (!auth.is_admin && !auth.is_hr)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized to approve.' }, { status: 403 });
    }

    const { id } = params;
    const connection = await pool.getConnection();

    await connection.beginTransaction();
    try {
      const [requests] = await connection.query(`
        SELECT * FROM tb_schedule_revision_requests WHERE id = ? FOR UPDATE
      `, [id]);

      if (requests.length === 0) throw new Error('Request not found.');
      const req = requests[0];

      if (req.status !== 'pending') throw new Error('Request already processed.');

      // In a real scenario, you'd apply the payload to tb_schedule here
      // For instance: if (req.revision_type === 'edit') { UPDATE tb_schedule ... }
      
      await connection.query(`
        UPDATE tb_schedule_revision_requests 
        SET status = 'approved', reviewed_by_karyawan_id = ?, reviewed_at = NOW() 
        WHERE id = ?
      `, [auth.karyawan_id, id]);

      await connection.commit();
      return NextResponse.json({ ok: true, message: 'Approved successfully.' });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
