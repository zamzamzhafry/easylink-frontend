import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthContextFromCookies } from '@/lib/auth-session';

export async function GET() {
  try {
    const auth = await getAuthContextFromCookies();
    if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const connection = await pool.getConnection();
    try {
      let query = `
        SELECT r.*, k.nama as requester_name, g.nama_group 
        FROM tb_schedule_revision_requests r
        JOIN tb_karyawan k ON r.requester_karyawan_id = k.id
        JOIN tb_group g ON r.group_id = g.id
      `;
      let params = [];

      // If not admin/hr, only show their own group's pending requests
      if (!auth.is_admin && !auth.is_hr) {
        if (!auth.groups || auth.groups.length === 0) {
          return NextResponse.json({ ok: true, data: [] });
        }
        query += ` WHERE r.group_id IN (?)`;
        params.push(auth.groups.map(g => g.group_id));
      }

      query += ` ORDER BY r.created_at DESC`;

      const [rows] = await connection.query(query, params);
      return NextResponse.json({ ok: true, data: rows });
    } finally {
      connection.release();
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await getAuthContextFromCookies();
    if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { group_id, revision_type, payload } = body;

    const connection = await pool.getConnection();
    try {
      // In a real app, you'd validate payload structure here
      await connection.query(`
        INSERT INTO tb_schedule_revision_requests 
        (requester_karyawan_id, group_id, revision_type, payload, status)
        VALUES (?, ?, ?, ?, 'pending')
      `, [auth.karyawan_id, group_id, revision_type, JSON.stringify(payload)]);

      return NextResponse.json({ ok: true, message: 'Revision submitted for approval.' });
    } finally {
      connection.release();
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
