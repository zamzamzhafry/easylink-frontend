import { NextResponse } from 'next/server';
import { z } from 'zod';
import pool from '@/lib/db';
import {
  createAuthContextByLoginId,
  createAuthContextByNip,
  findAuthAccountByLoginId,
  isPlaceholderEmployeeNip,
  setAuthCookie,
  updateAuthAccountLastLogin,
} from '@/lib/auth-session';
import { buildNormalizedAuthUser } from '@/lib/auth-hardening-helpers';
import { resolveAuthenticatedLane } from '@/lib/auth-login-helpers';
import { verifyPassword, hashPassword } from '@/lib/password';
import {
  checkLoginRateLimit,
  getLoginClientIp,
  LOGIN_RATE_LIMIT_MAX,
} from '@/lib/auth-login-rate-limit';

// Grill H5: rate-limit IN (below); CSRF token OUT — LAN-only + same-origin enforced in middleware.ts isValidOrigin().

// Unified credential-failure: invalid-id and invalid-password MUST return byte-identical bodies to prevent enumeration.
const INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials';

function invalidCredentialsResponse() {
  return NextResponse.json(
    { ok: false, error: INVALID_CREDENTIALS_MESSAGE },
    { status: 401 }
  );
}

async function finalizeLoginSuccess({
  authContext,
  loginId,
  request,
  subjectType,
}) {
  const response = NextResponse.json({
    ok: true,
    user: buildNormalizedAuthUser(authContext),
  });

  setAuthCookie(response, loginId, request, { subjectType });
  return response;
}

const loginSchema = z.object({
  login_id: z.string().min(1, 'Login ID is required').max(80).optional(),
  nip: z.string().min(1, 'Login ID is required').max(80).optional(),
  password: z.string().min(1, 'Password is required'),
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

    const loginId = String(result.data.login_id || result.data.nip || '').trim();
    const { password } = result.data;
    if (!loginId) {
      return NextResponse.json({ ok: false, error: 'Login ID is required' }, { status: 400 });
    }

    const clientIp = getLoginClientIp(request);
    const limit = checkLoginRateLimit({ ip: clientIp, loginId });
    if (!limit.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: `Too many login attempts. Try again in ${limit.retryAfterSeconds}s.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(limit.retryAfterSeconds),
            'X-RateLimit-Limit': String(LOGIN_RATE_LIMIT_MAX),
          },
        }
      );
    }

    const connection = await pool.getConnection();

    try {
      const standaloneAccount = await findAuthAccountByLoginId(loginId, connection);
      const selectedSubjectType = standaloneAccount ? 'account' : 'employee_nip';

      let accountContext = null;
      let nipContext = null;

      if (selectedSubjectType === 'account') {
        const { valid, needsRehash } = await verifyPassword(standaloneAccount.password_hash, password);
        if (!valid) {
          return invalidCredentialsResponse();
        }
        if (needsRehash) {
          const hashed = await hashPassword(password);
          await connection.query('UPDATE auth_accounts SET password_hash = ? WHERE id = ?', [hashed, standaloneAccount.id]);
        }

        await updateAuthAccountLastLogin(Number(standaloneAccount.id), connection);
        accountContext = await createAuthContextByLoginId(loginId, connection);

        if (!accountContext) {
          return NextResponse.json(
            { ok: false, error: 'Failed to create account session context' },
            { status: 500 }
          );
        }

        nipContext = await createAuthContextByNip(loginId, connection);
      } else {
        const [users] = await connection.query(
          `
          SELECT auth.*, k.nama, k.nip AS karyawan_nip
          FROM tb_karyawan_auth auth
          JOIN tb_karyawan k ON auth.karyawan_id = k.id
          WHERE auth.nip = ? AND auth.is_active = 1
        `,
          [loginId]
        );

        if (!Array.isArray(users) || users.length === 0) {
          return invalidCredentialsResponse();
        }

        const user = users[0];

        if (isPlaceholderEmployeeNip(user.karyawan_nip)) {
          return invalidCredentialsResponse();
        }

        const { valid: nipValid, needsRehash: nipNeedsRehash } = await verifyPassword(user.password_hash, password);
        if (!nipValid) {
          return invalidCredentialsResponse();
        }
        if (nipNeedsRehash) {
          const hashed = await hashPassword(password);
          await connection.query('UPDATE tb_karyawan_auth SET password_hash = ? WHERE karyawan_id = ?', [hashed, user.karyawan_id]);
        }

        await connection.query('UPDATE tb_karyawan_auth SET last_login_at = NOW() WHERE karyawan_id = ?', [
          user.karyawan_id,
        ]);

        nipContext = await createAuthContextByNip(loginId, connection);

        if (!nipContext) {
          return NextResponse.json(
            { ok: false, error: 'Failed to create session context' },
            { status: 500 }
          );
        }

        accountContext = await findAuthAccountByLoginId(loginId, connection)
          ? await createAuthContextByLoginId(loginId, connection)
          : null;
      }

      const laneResult = await resolveAuthenticatedLane({
        loginId,
        accountContext,
        nipContext,
        selectedSubjectType,
      });

      if (!laneResult.ok) {
        return NextResponse.json({ ok: false, error: laneResult.error }, { status: laneResult.status });
      }

      return finalizeLoginSuccess({
        authContext: laneResult.authContext,
        loginId,
        request,
        subjectType: laneResult.subjectType,
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
