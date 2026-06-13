export const dynamic = 'force-dynamic';
// app/api/admin/password-reset/route.js
//
// Task 19 (M4): admin-driven password reset for the NIP lane.
// Admin-only. NO self-service. An authenticated admin sets a target
// employee's tb_karyawan_auth.password_hash (bcrypt). Non-admin → 403,
// unauthenticated → 401. Logic lives in lib/admin-password-reset.js so
// it is unit-testable; this file is the Next request adapter.
//
// Rate-limit: intentionally NONE. The endpoint sits behind the auth
// cookie AND requires is_admin, and middleware.ts already applies a
// coarse 30/min per-IP cap to all mutating /api/* requests. The
// per-account login limiter (lib/auth-login-rate-limit) defends a
// credential-guessing surface that does not exist here — the caller is
// proven-admin before any work runs.
import { NextResponse } from 'next/server';
import { getAuthContextFromCookies } from '@/lib/auth-session';
import pool from '@/lib/db';
import { handleAdminPasswordReset } from '@/lib/admin-password-reset';

export async function POST(request) {
  const auth = await getAuthContextFromCookies();

  let body = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const result = await handleAdminPasswordReset({ auth, body, pool });
  return NextResponse.json(result.json, { status: result.status });
}
