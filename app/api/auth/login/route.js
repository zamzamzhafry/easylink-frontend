import { NextResponse } from 'next/server';
import { z } from 'zod';
import pool from '@/lib/db';
import { createAuthContextByNip, setAuthCookie, verifyPlainPassword } from '@/lib/auth-session';

const loginSchema = z.object({
  nip: z.string().min(1, 'NIP is required').max(50),
  password: z.string().min(1, 'Password is required')
});

export async function POST(request) {
  try {
    const body = await request.json();
    const result = loginSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid input', details: result.error.errors },
        { status: 400 }
      );
    }

    const { nip, password } = result.data;
    const connection = await pool.getConnection();

    try {
      // Use the new tb_karyawan_auth table
      const [users] = await connection.query(`
        SELECT auth.*, k.nama 
        FROM tb_karyawan_auth auth
        JOIN tb_karyawan k ON auth.karyawan_id = k.id
        WHERE auth.nip = ? AND auth.is_active = 1
      `, [nip]);

      if (users.length === 0) {
        return NextResponse.json({ ok: false, error: 'Invalid credentials or inactive account' }, { status: 401 });
      }

      const user = users[0];

      // Assuming verifyPlainPassword works, or bcrypt/argon2
      if (!verifyPlainPassword(user.password_hash, password)) {
        return NextResponse.json({ ok: false, error: 'Invalid credentials' }, { status: 401 });
      }

      // Update last login
      await connection.query('UPDATE tb_karyawan_auth SET last_login_at = NOW() WHERE karyawan_id = ?', [user.karyawan_id]);

      // Create session payload using NIP
      const authContext = await createAuthContextByNip(nip, connection);

      if (!authContext) {
         return NextResponse.json({ ok: false, error: 'Failed to create session context' }, { status: 500 });
      }

      const response = NextResponse.json({
        ok: true,
        user: {
          nip: authContext.nip,
          nama: authContext.nama,
          is_admin: authContext.is_admin,
          is_leader: authContext.is_leader
        }
      });

      // Set cookie
      await setAuthCookie(response, nip);
      return response;

    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
