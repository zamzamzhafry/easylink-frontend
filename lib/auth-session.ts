import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import {
  decodeSessionToken,
  encodeSessionToken,
  normalizeSubjectType,
} from '@/lib/auth-hardening-helpers.js';
import {
  LEGACY_EMPLOYEE_ROLE_TO_CANONICAL_ROLE,
  type CanonicalEmployeeRole,
} from '@/lib/domain/employee-auth-model';

const SESSION_COOKIE = 'easylink_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h
const SECRET = (() => {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET env var is required in production');
  }
  console.warn('[auth-session] AUTH_SECRET not set — using insecure dev-only fallback');
  return 'dev-only-insecure-fallback';
})();
const AUTH_ACCOUNT_TABLE = 'auth_accounts';
const AUTH_ACCOUNT_SCOPE_TABLE = 'auth_account_group_scope';

function parseEnabledFlag(raw: string | null | undefined, defaultEnabled = true) {
  if (raw == null) return defaultEnabled;
  const normalized = raw.trim().toLowerCase();
  return !['0', 'false', 'off', 'no', 'disabled'].includes(normalized);
}

const LEGACY_PIN_FALLBACK_ENABLED = parseEnabledFlag(
  process.env.EASYLINK_ENABLE_LEGACY_PIN_FALLBACK,
  true
);
const LEGACY_SESSION_PAYLOAD_COMPAT_ENABLED = parseEnabledFlag(
  process.env.EASYLINK_ENABLE_LEGACY_SESSION_PAYLOAD_COMPAT,
  true
);

type SessionPayload = {
  subject: string;
  exp: number;
  payload_format: 'canonical' | 'legacy';
  subject_type?: AuthSubjectType;
};

type UserRow = {
  pin: string;
  nama: string | null;
  privilege: number | string | null;
};

type GroupAccessRow = {
  group_id: number | string;
  nama_group: string | null;
  can_schedule: number | string | null;
  can_dashboard: number | string | null;
  is_leader: number | string | null;
};

type AccountGroupScopeRow = {
  group_id: number | string;
  nama_group: string | null;
};

export type AuthAccountRole = 'admin' | 'hr' | 'scheduler' | 'viewer';
export type AuthSubjectType = 'account' | 'employee_nip' | 'legacy_pin';

type AuthAccountRow = {
  id: number | string;
  login_id: string;
  display_name: string | null;
  password_hash: string | null;
  role_key: string;
  is_active: number | string | null;
  last_login_at?: string | null;
};

export type GroupAccess = {
  group_id: number;
  nama_group: string | null;
  can_schedule: boolean;
  can_dashboard: boolean;
  is_leader: boolean;
};

export type AuthContext = {
  pin: string;
  nama: string;
  privilege: number;
  is_admin: boolean;
  can_schedule: boolean;
  can_dashboard: boolean;
  is_leader: boolean;
  is_hr?: boolean;
  nip?: string;
  karyawan_id?: number;
  account_id?: number;
  login_id?: string;
  role_key?: AuthAccountRole | string;
  subject_type?: AuthSubjectType;
  groups: GroupAccess[];
  canonical_roles: CanonicalEmployeeRole[];
};

export type LegacyAuthFlagSnapshot = Pick<
  AuthContext,
  'privilege' | 'is_admin' | 'is_leader' | 'can_schedule' | 'can_dashboard' | 'is_hr'
>;

export const LEGACY_AUTH_FLAG_TO_CANONICAL_ROLE: Record<string, CanonicalEmployeeRole> = {
  is_admin: 'admin',
  is_leader: 'group_leader',
  is_hr: 'group_leader',
  can_schedule: 'group_leader',
  can_dashboard: 'employee',
};

export const LEGACY_AUTH_ADMIN_PRIVILEGE_MIN = 4;

const legacyRoleLabelToCanonicalRoleMap: Record<string, CanonicalEmployeeRole> = {
  ...LEGACY_EMPLOYEE_ROLE_TO_CANONICAL_ROLE,
};

const GLOBAL_ACCOUNT_ROLES = new Set<AuthAccountRole>(['admin', 'hr']);

const ACCOUNT_ROLE_COMPAT = {
  admin: {
    privilege: 4,
    is_admin: true,
    is_hr: false,
    is_leader: true,
    can_schedule: true,
    can_dashboard: true,
    canonical_roles: ['admin'] as CanonicalEmployeeRole[],
  },
  hr: {
    privilege: 3,
    is_admin: false,
    is_hr: true,
    is_leader: false,
    can_schedule: true,
    can_dashboard: true,
    canonical_roles: ['group_leader'] as CanonicalEmployeeRole[],
  },
  scheduler: {
    privilege: 2,
    is_admin: false,
    is_hr: false,
    is_leader: true,
    can_schedule: true,
    can_dashboard: true,
    canonical_roles: ['group_leader'] as CanonicalEmployeeRole[],
  },
  viewer: {
    privilege: 1,
    is_admin: false,
    is_hr: false,
    is_leader: false,
    can_schedule: true,
    can_dashboard: true,
    canonical_roles: ['employee'] as CanonicalEmployeeRole[],
  },
} as const;

export function normalizeAuthAccountRole(value: string | null | undefined): AuthAccountRole | null {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  if (normalized === 'admin') return 'admin';
  if (normalized === 'hr') return 'hr';
  if (normalized === 'scheduler') return 'scheduler';
  if (normalized === 'viewer') return 'viewer';

  return null;
}

export function mapLegacyRoleLabelToCanonicalRole(
  roleLabel: string | null | undefined
): CanonicalEmployeeRole {
  const normalized = String(roleLabel ?? '')
    .trim()
    .toLowerCase();

  return legacyRoleLabelToCanonicalRoleMap[normalized] ?? 'employee';
}

export function getCanonicalRoleFromLegacyAuthFlags(
  auth: LegacyAuthFlagSnapshot
): CanonicalEmployeeRole {
  const privilege = Number(auth.privilege ?? 0);
  if (auth.is_admin || privilege >= LEGACY_AUTH_ADMIN_PRIVILEGE_MIN) return 'admin';
  if (auth.is_leader || auth.is_hr || auth.can_schedule) return 'group_leader';
  return 'employee';
}

export function getCanonicalRolesFromLegacyAuth(
  auth: LegacyAuthFlagSnapshot,
  legacyRoleLabels: readonly (string | null | undefined)[] = []
): CanonicalEmployeeRole[] {
  const mappedLegacyRoles = legacyRoleLabels.map((roleLabel) =>
    mapLegacyRoleLabelToCanonicalRole(roleLabel)
  );

  const canonicalRoles = [
    getCanonicalRoleFromLegacyAuthFlags(auth),
    ...mappedLegacyRoles,
    auth.can_dashboard ? 'employee' : null,
  ].filter(Boolean) as CanonicalEmployeeRole[];

  return [...new Set(canonicalRoles)];
}

const legacyAuthFallbackTelemetry = { hits: 0 };

export function recordLegacyAuthFallbackHit() {
  legacyAuthFallbackTelemetry.hits += 1;
}

export function getLegacyAuthFallbackHits() {
  return legacyAuthFallbackTelemetry.hits;
}

const tableExistsCache = new Map<string, boolean>();

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function safeBase64UrlDecode(value: string) {
  try {
    return base64UrlDecode(value);
  } catch (error) {
    logSessionDecodeFailure('BASE64URL_DECODE_ERROR', error);
    throw error;
  }
}

function sign(raw: string) {
  return crypto.createHmac('sha256', SECRET).update(raw).digest('base64url');
}

function encodeSession(payload: SessionPayload) {
  return encodeSessionToken(payload, sign, base64UrlEncode);
}

function logSessionDecodeFailure(reason: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'unknown');
  console.warn('[auth-session] failed to decode session payload', {
    code: 'AUTH_SESSION_DECODE_FAILURE',
    reason,
    error: message,
  });
}

function decodeSession(token?: string | null): SessionPayload | null {
  try {
    const payload = decodeSessionToken(
      token,
      sign,
      safeBase64UrlDecode,
      LEGACY_SESSION_PAYLOAD_COMPAT_ENABLED
    );

    if (!payload) return null;

    const subjectType = payload.subject_type;
    const normalizedSubjectType = subjectType || undefined;
    const payloadFormat = payload.payload_format === 'legacy' ? 'legacy' : 'canonical';
    const inferredSubjectType = payload.subject.startsWith('account:')
      ? 'account'
      : payload.subject.startsWith('nip:')
        ? 'employee_nip'
        : payload.subject.startsWith('pin:')
          ? 'legacy_pin'
          : undefined;

    if (normalizedSubjectType && inferredSubjectType && normalizedSubjectType !== inferredSubjectType) {
      logSubjectTypeMismatch(inferredSubjectType, normalizedSubjectType);
    }

    return {
      subject: payload.subject,
      exp: payload.exp,
      payload_format: payloadFormat,
      subject_type: normalizedSubjectType,
    };
  } catch (error) {
    logSessionDecodeFailure('TOKEN_PARSE_FAILURE', error);
    return null;
  }
}

function getSubjectValueForType(subject: string, subjectType: AuthSubjectType) {
  if (subjectType === 'account') {
    return subject.startsWith('account:') ? subject.slice('account:'.length) : subject;
  }
  if (subjectType === 'employee_nip') {
    return subject.startsWith('nip:') ? subject.slice('nip:'.length) : subject;
  }
  if (subjectType === 'legacy_pin') {
    return subject.startsWith('pin:') ? subject.slice('pin:'.length) : subject;
  }
  return subject;
}

function logSubjectTypeMismatch(expected: AuthSubjectType, actual: AuthSubjectType | undefined) {
  if (!actual || actual === expected) return;

  console.warn('[auth-session] subject type mismatch', {
    code: 'AUTH_SESSION_SUBJECT_TYPE_MISMATCH',
    reason: `${expected}_WITH_${actual}`,
    expected_subject_type: expected,
    actual_subject_type: actual,
  });
}

async function hasTable(tableName: string) {
  if (tableExistsCache.has(tableName)) {
    return tableExistsCache.get(tableName) === true;
  }

  const [rows] = await pool.query(
    `SELECT 1 AS found
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
     LIMIT 1`,
    [tableName]
  );

  const exists = Array.isArray(rows) && rows.length > 0;
  tableExistsCache.set(tableName, exists);
  return exists;
}

function normalizeBoolean(raw: number | string | null | undefined) {
  return Number(raw ?? 0) === 1;
}

function buildScopedGroupAccess(
  rows: readonly AccountGroupScopeRow[],
  roleKey: AuthAccountRole
): GroupAccess[] {
  const compat = ACCOUNT_ROLE_COMPAT[roleKey];
  return rows.map((row) => ({
    group_id: Number(row.group_id),
    nama_group: row.nama_group || null,
    can_schedule: compat.can_schedule,
    can_dashboard: compat.can_dashboard,
    is_leader: compat.is_leader,
  }));
}

export async function findAuthAccountByLoginId(
  loginId: string,
  connectionParam: any = null
): Promise<AuthAccountRow | null> {
  const normalizedLoginId = String(loginId ?? '').trim();
  if (!normalizedLoginId) return null;

  if (!(await hasTable(AUTH_ACCOUNT_TABLE))) {
    return null;
  }

  let connection = connectionParam;
  let shouldRelease = false;

  try {
    if (!connection) {
      connection = await pool.getConnection();
      shouldRelease = true;
    }

    const [rows] = await connection.query(
      `SELECT id, login_id, display_name, password_hash, role_key, is_active, last_login_at
       FROM ${AUTH_ACCOUNT_TABLE}
       WHERE login_id = ?
       LIMIT 1`,
      [normalizedLoginId]
    );

    const account = Array.isArray(rows) ? (rows[0] as AuthAccountRow | undefined) : undefined;
    if (!account) return null;
    if (!normalizeBoolean(account.is_active ?? 0)) return null;

    return account;
  } finally {
    if (shouldRelease && connection) connection.release();
  }
}

export async function createAuthContextByLoginId(
  loginId: string,
  connectionParam: any = null
): Promise<AuthContext | null> {
  let connection = connectionParam;
  let shouldRelease = false;

  try {
    const account = await findAuthAccountByLoginId(loginId, connectionParam);
    if (!account) return null;

    if (!connection) {
      connection = await pool.getConnection();
      shouldRelease = true;
    }

    const roleKey = normalizeAuthAccountRole(account.role_key);
    if (!roleKey) return null;

    let groups: GroupAccess[] = [];
    if (!GLOBAL_ACCOUNT_ROLES.has(roleKey) && (await hasTable(AUTH_ACCOUNT_SCOPE_TABLE))) {
      const [groupRowsRaw] = await connection.query(
        `SELECT s.group_id, g.nama_group
         FROM ${AUTH_ACCOUNT_SCOPE_TABLE} s
         LEFT JOIN tb_group g ON g.id = s.group_id
         WHERE s.account_id = ?
         ORDER BY g.nama_group ASC, s.group_id ASC`,
        [account.id]
      );
      const groupRows = Array.isArray(groupRowsRaw)
        ? (groupRowsRaw as AccountGroupScopeRow[])
        : [];
      groups = buildScopedGroupAccess(groupRows, roleKey);
    }

    const compat = ACCOUNT_ROLE_COMPAT[roleKey];
    return {
      account_id: Number(account.id),
      login_id: account.login_id,
      role_key: roleKey,
      subject_type: 'account',
      pin: account.login_id,
      nama: account.display_name || account.login_id,
      privilege: compat.privilege,
      is_admin: compat.is_admin,
      is_hr: compat.is_hr,
      is_leader: compat.is_leader,
      can_schedule: compat.can_schedule,
      can_dashboard: compat.can_dashboard,
      groups,
      canonical_roles: compat.canonical_roles,
    };
  } catch (error) {
    console.error('Error in createAuthContextByLoginId:', error);
    return null;
  } finally {
    if (shouldRelease && connection) connection.release();
  }
}

export async function updateAuthAccountLastLogin(
  accountId: number,
  connectionParam: any = null
): Promise<void> {
  if (!Number.isInteger(accountId) || !(await hasTable(AUTH_ACCOUNT_TABLE))) {
    return;
  }

  let connection = connectionParam;
  let shouldRelease = false;

  try {
    if (!connection) {
      connection = await pool.getConnection();
      shouldRelease = true;
    }

    await connection.query(`UPDATE ${AUTH_ACCOUNT_TABLE} SET last_login_at = NOW() WHERE id = ?`, [
      accountId,
    ]);
  } finally {
    if (shouldRelease && connection) connection.release();
  }
}

// Legacy employee-bound auth path
export async function createAuthContextByNip(
  nip: string,
  connectionParam: any = null
): Promise<AuthContext | null> {
  let connection = connectionParam;
  let shouldRelease = false;

  try {
    if (!connection) {
      connection = await pool.getConnection();
      shouldRelease = true;
    }

    const [users] = await connection.query(
      'SELECT a.karyawan_id, a.nip, k.nama, k.pin FROM tb_karyawan_auth a JOIN tb_karyawan k ON a.karyawan_id = k.id WHERE a.nip = ? AND a.is_active = 1',
      [nip]
    );

    if (!Array.isArray(users) || users.length === 0) return null;
    const user = users[0] as any;

    const [roles] = await connection.query(
      'SELECT role_key, group_id FROM tb_karyawan_roles WHERE karyawan_id = ?',
      [user.karyawan_id]
    );
    const roleRows = Array.isArray(roles) ? (roles as any[]) : [];
    const LEADER_ROLE_KEYS = ['group_leader', 'scheduler'];
    const isGlobalRow = (r: any) => r.group_id === null || r.group_id === undefined;

    // B2: admin/hr are global ONLY when granted by a global-scope role row
    // (group_id IS NULL). A group-scoped admin/hr row must not confer global rights.
    const is_admin = roleRows.some((r) => r.role_key === 'admin' && isGlobalRow(r));
    const is_hr = roleRows.some((r) => r.role_key === 'hr' && isGlobalRow(r));
    // Top-level is_leader is true if leader anywhere (global row or any group row).
    const is_leader = roleRows.some((r) => LEADER_ROLE_KEYS.includes(r.role_key));

    const legacyFlagSnapshot: LegacyAuthFlagSnapshot = {
      privilege: is_admin ? 4 : 1,
      is_admin,
      is_leader,
      is_hr,
      can_schedule: is_admin || is_hr || is_leader,
      can_dashboard: is_admin || is_hr || is_leader,
    };
    const canonical_roles = getCanonicalRolesFromLegacyAuth(
      legacyFlagSnapshot,
      roleRows.map((r) => r.role_key)
    );

    let groups: GroupAccess[] = [];
    if (!is_admin && !is_hr) {
      // B1: resolve leadership PER GROUP from each group's own role row(s),
      // not from a single account-wide role. Being leader of group A must not
      // grant leader rights on group B where the employee is only a viewer.
      const groupRoleMap = new Map<number, { is_leader: boolean }>();
      for (const r of roleRows) {
        if (isGlobalRow(r)) continue;
        if (!['group_leader', 'scheduler', 'viewer'].includes(r.role_key)) continue;
        const gid = Number(r.group_id);
        const existing = groupRoleMap.get(gid) ?? { is_leader: false };
        if (LEADER_ROLE_KEYS.includes(r.role_key)) existing.is_leader = true;
        groupRoleMap.set(gid, existing);
      }
      const scopedGroupIds = [...groupRoleMap.keys()];

      if (scopedGroupIds.length > 0) {
        const [groupRows] = await connection.query(
          'SELECT id as group_id, nama_group FROM tb_group WHERE id IN (?)',
          [scopedGroupIds]
        );
        const nameById = new Map<number, string | null>();
        for (const row of (groupRows as AccountGroupScopeRow[]) ?? []) {
          nameById.set(Number(row.group_id), row.nama_group || null);
        }
        groups = scopedGroupIds.map((gid) => {
          const leaderOfGroup = groupRoleMap.get(gid)?.is_leader ?? false;
          return {
            group_id: gid,
            nama_group: nameById.get(gid) ?? null,
            can_schedule: leaderOfGroup,
            can_dashboard: true,
            is_leader: leaderOfGroup,
          };
        });
      }

      // Fallback: if no groups from roles, check tb_user_group_access
      if (groups.length === 0 && (await hasTable('tb_user_group_access'))) {
        const userPin = user.pin || user.nip;
        if (userPin) {
          const [ugaRows] = await connection.query(
            `SELECT uga.group_id, g.nama_group, uga.can_schedule, uga.can_dashboard, uga.is_leader
             FROM tb_user_group_access uga
             LEFT JOIN tb_group g ON g.id = uga.group_id
             WHERE uga.pin = ? AND uga.is_approved = 1`,
            [userPin]
          );
          const ugaList = Array.isArray(ugaRows) ? (ugaRows as GroupAccessRow[]) : [];
          groups = ugaList.map((row) => ({
            group_id: Number(row.group_id),
            nama_group: row.nama_group || null,
            can_schedule: normalizeBoolean(row.can_schedule),
            can_dashboard: normalizeBoolean(row.can_dashboard),
            is_leader: normalizeBoolean(row.is_leader),
          }));
        }
      }
    }

    return {
      nip: user.nip,
      pin: user.pin || user.nip,
      karyawan_id: Number(user.karyawan_id),
      nama: user.nama,
      privilege: is_admin ? 4 : 1,
      is_admin,
      is_leader,
      is_hr,
      can_schedule: is_admin || is_hr || is_leader,
      can_dashboard: is_admin || is_hr || is_leader,
      groups,
      canonical_roles,
      subject_type: 'employee_nip',
    };
  } catch (error) {
    console.error('Error in createAuthContextByNip:', error);
    return null;
  } finally {
    if (shouldRelease && connection) connection.release();
  }
}

export async function createAuthContextByPin(pin: string): Promise<AuthContext | null> {
  recordLegacyAuthFallbackHit();
  console.warn('[auth-session] Legacy PIN fallback used for subject:', pin);

  const [userRows] = await pool.query(
    `SELECT pin, nama, privilege
     FROM tb_user
     WHERE pin = ?
     LIMIT 1`,
    [pin]
  );
  const user = (Array.isArray(userRows) ? userRows[0] : null) as UserRow | null;

  if (!user) return null;

  // Check if employee is still active (guard against stale privilege escalation)
  if (await hasTable('tb_karyawan')) {
    const [empRows] = await pool.query(
      'SELECT isDeleted FROM tb_karyawan WHERE pin = ? LIMIT 1',
      [pin]
    );
    const emp = Array.isArray(empRows) ? empRows[0] as any : null;
    if (emp && Number(emp.isDeleted) === 1) {
      console.warn('[auth-session] PIN fallback blocked: employee deleted, pin:', pin);
      return null;
    }
  }

  const privilege = Number(user.privilege ?? 0) || 0;
  const isAdmin = privilege >= 4;
  let groups: GroupAccess[] = [];

  if (!isAdmin && (await hasTable('tb_user_group_access'))) {
    const [rowsRaw] = await pool.query(
      `SELECT uga.group_id,
              g.nama_group,
              uga.can_schedule,
              uga.can_dashboard,
              uga.is_leader
       FROM tb_user_group_access uga
       LEFT JOIN tb_group g ON g.id = uga.group_id
       WHERE uga.pin = ?
         AND uga.is_approved = 1`,
      [pin]
    );
    const rows = (Array.isArray(rowsRaw) ? rowsRaw : []) as GroupAccessRow[];
    groups = rows.map((row) => ({
      group_id: Number(row.group_id),
      nama_group: row.nama_group || null,
      can_schedule: normalizeBoolean(row.can_schedule),
      can_dashboard: normalizeBoolean(row.can_dashboard),
      is_leader: normalizeBoolean(row.is_leader),
    }));
  }

  const groupHasSchedule = groups.some((group) => group.can_schedule);
  const groupHasDashboard = groups.some((group) => group.can_dashboard);
  const leaderAccess = isAdmin || groups.some((group) => group.is_leader);
  const legacyFlagSnapshot: LegacyAuthFlagSnapshot = {
    privilege,
    is_admin: isAdmin,
    is_leader: leaderAccess,
    is_hr: false,
    can_schedule: isAdmin || groupHasSchedule,
    can_dashboard: isAdmin || groupHasDashboard,
  };
  const canonical_roles = getCanonicalRolesFromLegacyAuth(legacyFlagSnapshot);

  return {
    pin: String(user.pin),
    nama: user.nama || `PIN ${user.pin}`,
    privilege,
    is_admin: isAdmin,
    can_schedule: isAdmin || groupHasSchedule,
    can_dashboard: isAdmin || groupHasDashboard,
    is_leader: leaderAccess,
    groups,
    canonical_roles,
    subject_type: 'legacy_pin',
  };
}

export async function getAuthContextFromCookies(): Promise<AuthContext | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const payload = decodeSession(token);
  if (!payload) return null;

  const normalizedSubjectType = normalizeSubjectType(payload.subject_type);

  if (normalizedSubjectType === 'account') {
    return createAuthContextByLoginId(getSubjectValueForType(payload.subject, 'account'));
  }
  if (normalizedSubjectType === 'employee_nip') {
    return createAuthContextByNip(getSubjectValueForType(payload.subject, 'employee_nip'));
  }
  if (normalizedSubjectType === 'legacy_pin') {
    if (!LEGACY_PIN_FALLBACK_ENABLED) return null;
    return createAuthContextByPin(getSubjectValueForType(payload.subject, 'legacy_pin'));
  }

  if (payload.subject.startsWith('account:')) {
    return createAuthContextByLoginId(payload.subject.slice('account:'.length));
  }
  if (payload.subject.startsWith('nip:')) {
    return createAuthContextByNip(payload.subject.slice('nip:'.length));
  }
  if (payload.subject.startsWith('pin:')) {
    if (!LEGACY_PIN_FALLBACK_ENABLED) return null;
    return createAuthContextByPin(payload.subject.slice('pin:'.length));
  }

  if (!LEGACY_SESSION_PAYLOAD_COMPAT_ENABLED) {
    return null;
  }

  const accountContext = await createAuthContextByLoginId(payload.subject);
  if (accountContext) return accountContext;

  const nipContext = await createAuthContextByNip(payload.subject);
  if (nipContext) return nipContext;

  if (!LEGACY_PIN_FALLBACK_ENABLED) return null;
  return createAuthContextByPin(payload.subject);
}

export function setAuthCookie(
  response: NextResponse,
  subject: string,
  request: any = null,
  options: { subjectType?: AuthSubjectType } = {}
) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const subjectType = normalizeSubjectType(options.subjectType) ?? 'account';

  const token = encodeSession({
    subject: String(subject ?? '').trim(),
    subject_type: subjectType,
    exp,
    payload_format: 'canonical',
  });
  const forwardedProto = String(request?.headers?.get?.('x-forwarded-proto') ?? '').trim();
  const requestProtocol = String(request?.nextUrl?.protocol ?? '').trim().replace(/:$/, '');
  const envForcesInsecure = process.env.ALLOW_INSECURE_COOKIES === 'true';
  const secure = envForcesInsecure
    ? false
    : forwardedProto
      ? forwardedProto === 'https'
      : requestProtocol
        ? requestProtocol === 'https'
        : process.env.NODE_ENV === 'production';
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearAuthCookie(response: NextResponse, request: any = null) {
  const forwardedProto = String(request?.headers?.get?.('x-forwarded-proto') ?? '').trim();
  const requestProtocol = String(request?.nextUrl?.protocol ?? '').trim().replace(/:$/, '');
  const envForcesInsecure = process.env.ALLOW_INSECURE_COOKIES === 'true';
  const secure = envForcesInsecure
    ? false
    : forwardedProto
      ? forwardedProto === 'https'
      : requestProtocol
        ? requestProtocol === 'https'
        : process.env.NODE_ENV === 'production';
  response.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export function verifyPlainPassword(stored: string | null | undefined, input: string) {
  const dbValue = String(stored ?? '').trim();
  const typed = String(input ?? '').trim();
  if (!dbValue && !typed) return true;
  return dbValue === typed;
}

export function isAllowedGroup(
  auth: AuthContext,
  groupId: number,
  capability: 'schedule' | 'dashboard' | 'leader'
) {
  if (auth.is_admin || auth.is_hr) return true;
  const group = auth.groups.find((item) => Number(item.group_id) === Number(groupId));
  if (!group) return false;
  if (capability === 'leader') return group.is_leader;
  return capability === 'schedule' ? group.can_schedule : group.can_dashboard;
}


export function getRoleDisplayLabel(auth: AuthContext): string {
  if (auth.is_admin) return 'Admin';
  if (auth.is_hr) return 'HR';
  if (auth.role_key === 'scheduler' || auth.is_leader) return 'Group Leader';
  if (auth.role_key === 'viewer') return 'Viewer';
  if (auth.can_schedule || auth.can_dashboard) return 'Member';
  return 'Member';
}

export function getAllowedGroupIds(
  auth: AuthContext,
  capability: 'schedule' | 'dashboard' | 'leader'
) {
  if (auth.is_admin || auth.is_hr) return null;
  return auth.groups
    .filter((group) => {
      if (capability === 'leader') return group.is_leader;
      return capability === 'schedule' ? group.can_schedule : group.can_dashboard;
    })
    .map((group) => Number(group.group_id));
}

export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json({ ok: false, error: message }, { status: 401 });
}

export function forbiddenResponse(message = 'Forbidden') {
  return NextResponse.json({ ok: false, error: message }, { status: 403 });
}
