export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import {
  getAuthContextFromCookies,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/auth-session';
import pool from '@/lib/db';

export async function GET() {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse('Login required.');
  if (!auth.is_admin) return forbiddenResponse('Only admin can view user list.');

  const [rows] = await pool.query(`
    SELECT pin, nama, privilege
    FROM tb_user
    ORDER BY nama ASC, pin ASC
  `);

  return NextResponse.json(rows);
}

