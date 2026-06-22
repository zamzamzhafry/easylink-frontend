import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import pool from '@/lib/db';
import {
  createAuthContextByLoginId,
  createAuthContextByNip,
  findAuthAccountByLoginId,
  isPlaceholderEmployeeNip,
  setAuthCookie,
  updateAuthAccountLastLogin,
  type AuthContext,
  type AccountAuthContext,
  type EmployeeAuthContext,
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

type LoginSubjectType = 'account' | 'employee_nip';

type KaryawanAuthLoginRow = {
  karyawan_id: number | string;
  password_hash: string | null;
  karyawan_nip: string | null;
};

type LaneResult =
  | { ok: true; authContext: AuthContext; subjectType: LoginSubjectType }
  | { ok: false; status: number; error: string };

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
}: {
  authContext: AuthContext;
  loginId: string;
  request: NextRequest;
  subjectType: LoginSubjectType;
}) {
  const response = NextResponse.json({
    ok: true,
    user: buildNormalizedAuthUser(authContext),
  });

  // T9 (Amendment A): NIP lane writes immutable karyawan_id PK as subject.
  // Account lane (auth_accounts table) has NO karyawan_id FK — stays on st='account' / sub='account:<login_id>'
  // until T16 deprecates the standalone account lane. Both formats coexist; getAuthContextFromCookies
  // accepts both.
  if (subjectType === 'employee_nip' && authContext.subject_type === 'employee_nip') {
    const karyawanId = authContext.karyawan_id;
    if (Number.isFinite(karyawanId) && Number.isInteger(karyawanId) && karyawanId > 0) {
      setAuthCookie(response, String(karyawanId), request, { subjectType: 'karyawan_id' });
      return response;
    }
  }
  setAuthCookie(response, loginId, request, { subjectType });
  return response;
}

const loginSchema = z.object({
  login_id: z.string().min(1, 'Login ID is required').max(80).optional(),
  nip: z.string().min(1, 'Login ID is required').max(80).optional(),
  password: z.string().min(1, 'Password is required'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = loginSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid input', details: result.error.issues },
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
      const selectedSubjectType: LoginSubjectType = standaloneAccount ? 'account' : 'employee_nip';

      let accountContext: AccountAuthContext | null = null;
      let nipContext: EmployeeAuthContext | null = null;

      if (selectedSubjectType === 'account' && standaloneAccount) {
        const { valid, needsRehash } = await verifyPassword(standaloneAccount.password_hash, password);
        if (!valid) {
          return invalidCredentialsResponse();
        }
        if (needsRehash) {
          const hashed = await hashPassword(password);
          await connection.query('UPDATE auth_accounts SET password_hash = ? WHERE id = ?', [hashed, standaloneAccount.id]);
        }

        await updateAuthAccountLastLogin(Number(standaloneAccount.id), connection);
        const ctx = await createAuthContextByLoginId(loginId, connection);

        if (!ctx || ctx.subject_type !== 'account') {
          return NextResponse.json(
            { ok: false, error: 'Failed to create account session context' },
            { status: 500 }
          );
        }
        accountContext = ctx;

        const nipCtx = await createAuthContextByNip(loginId, connection);
        nipContext = nipCtx && nipCtx.subject_type === 'employee_nip' ? nipCtx : null;
      } else {
        const [usersRaw] = await connection.query(
          `
          SELECT auth.*, k.nama, k.nip AS karyawan_nip
          FROM tb_karyawan_auth auth
          JOIN tb_karyawan k ON auth.karyawan_id = k.id
          WHERE auth.nip = ? AND auth.is_active = 1 AND k.isDeleted = 0
        `,
          [loginId]
        );

        const users = (Array.isArray(usersRaw) ? usersRaw : []) as KaryawanAuthLoginRow[];
        if (users.length === 0) {
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

        const nipCtx = await createAuthContextByNip(loginId, connection);

        if (!nipCtx || nipCtx.subject_type !== 'employee_nip') {
          return NextResponse.json(
            { ok: false, error: 'Failed to create session context' },
            { status: 500 }
          );
        }
        nipContext = nipCtx;

        if (await findAuthAccountByLoginId(loginId, connection)) {
          const ctx = await createAuthContextByLoginId(loginId, connection);
          accountContext = ctx && ctx.subject_type === 'account' ? ctx : null;
        }
      }

      const laneResult = (await resolveAuthenticatedLane({
        loginId,
        accountContext,
        nipContext,
        selectedSubjectType,
      })) as LaneResult;

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
