export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import pool from '@/lib/db';
import {
  createAuthContextByPin,
  setAuthCookie,
  verifyPlainPassword,
} from '@/lib/auth-session';

const loginSchema = z.object({
  pin: z.string().trim().min(1, 'PIN is required.').max(12, 'PIN is too long.'),
  password: z.string().max(100, 'Password is too long.').optional().default(''),
});

export async function POST(req) {
  const parsed = loginSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message || 'Invalid login payload.' },
      { status: 400 }
    );
  }

  const { pin, password } = parsed.data;
  const [[user]] = await pool.query(
    `SELECT pin, nama, pwd, privilege
     FROM tb_user
     WHERE pin = ?
     LIMIT 1`,
    [pin]
  );

  if (!user || !verifyPlainPassword(user.pwd, password)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid PIN or password.' },
      { status: 401 }
    );
  }

  const auth = await createAuthContextByPin(String(user.pin));
  if (!auth) {
    return NextResponse.json(
      { ok: false, error: 'Unable to load user profile.' },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ ok: true, user: auth });
  setAuthCookie(response, auth.pin);
  return response;
}


