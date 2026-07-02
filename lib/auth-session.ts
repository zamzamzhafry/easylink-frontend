import crypto from 'crypto';
import type { NextResponse as NextResponseType } from 'next/server';
import pool from '@/lib/db';
import { tableExists as hasTable } from '@/lib/schema-probe';

// ponytail: next/headers + next/server have no Node-ESM export (Next-bundler-only),
// which blocks `node --test` from loading this module. Lazy-load inside the 3 runtime
// boundary fns so the module imports clean under Node; Next route handlers await the
// returned promises transparently. Upgrade path: move cookie/Response helpers into a
// separate next-runtime-only module once tests need them.
let _cookies: typeof import('next/headers')['cookies'] | null = null;
let _NextResponse: typeof import('next/server')['NextResponse'] | null = null;
async function getCookieStore() {
  if (!_cookies) ({ cookies: _cookies } = await import('next/headers'));
  return _cookies!();
}

// ponytail: RSC pages (dashboard etc.) can't use the useAppLocale client hook,
// so read the same locale the client persists. Client sets this cookie alongside
// localStorage in app-shell.handleLocaleChange. Ceiling: if locale becomes
// request-driven (e.g. Accept-Language), resolve here. Upgrade: provider context.
export async function getLocaleFromCookies(): Promise<'en' | 'id'> {
  try {
    const store = await getCookieStore();
    const v = store.get('easylink_locale')?.value;
    if (v === 'en' || v === 'id') return v;
  } catch {
    // non-runtime context (node --test) — default
  }
  return 'en';
}
async function getNextResponse() {
  if (!_NextResponse) ({ NextResponse: _NextResponse } = await import('next/server'));
  return _NextResponse!;
}
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

// Placeholder NIPs assigned to 44 staff that had NULL tb_karyawan.nip pre-backfill.
// They MUST be blocked from logging in until HR backfills the real NIP.
// Range is strictly numeric integer [PLACEHOLDER_NIP_MIN, PLACEHOLDER_NIP_MAX].
// Map of placeholder NIP -> karyawan/name: /tmp/nip_placeholder_report.tsv
export const PLACEHOLDER_NIP_MIN = 9990001;
export const PLACEHOLDER_NIP_MAX = 9990044;

export function isPlaceholderEmployeeNip(rawNip: unknown): boolean {
  if (rawNip == null) return false;
  const str = String(rawNip).trim();
  if (!/^\d+$/.test(str)) return false;
  const n = Number(str);
  if (!Number.isInteger(n)) return false;
  return n >= PLACEHOLDER_NIP_MIN && n <= PLACEHOLDER_NIP_MAX;
}

function parseEnabledFlag(raw: string | null | undefined, defaultEnabled = true) {
  if (raw == null) return defaultEnabled;
  const normalized = raw.trim().toLowerCase();
  return !['0', 'false', 'off', 'no', 'disabled'].includes(normalized);
}

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

// Shared row shape for createAuthContextByNip + createAuthContextByKaryawanId.
// SELECT projection: a.karyawan_id, a.nip, k.nama, k.pin, k.nip AS karyawan_nip
type KaryawanAuthRow = {
  karyawan_id: number | string;
  nip: string;
  nama: string | null;
  pin: string | null;
  karyawan_nip: string | null;
};

type RawKaryawanRoleRow = {
  role_key: string;
  group_id: number | string | null;
};

export const GLOBAL_ROLE_KEYS = ['admin', 'hr'] as const;
export const SCOPED_ROLE_KEYS = ['group_leader', 'employee'] as const;

type GlobalRoleKey = (typeof GLOBAL_ROLE_KEYS)[number];
type ScopedRoleKey = (typeof SCOPED_ROLE_KEYS)[number];

type GlobalRoleRow = { role_key: GlobalRoleKey; group_id: null };
type ScopedRoleRow = { role_key: ScopedRoleKey; group_id: number };
export type KaryawanRoleRow = GlobalRoleRow | ScopedRoleRow;

// B2 invariant enforced by construction: admin/hr must have null group_id,
// scoped roles must have a numeric group_id. Invalid rows are dropped here
// (the only place that decides what "global" means).
function narrowRoleRow(raw: RawKaryawanRoleRow): KaryawanRoleRow | null {
  const key = raw.role_key;
  const gidRaw = raw.group_id;
  const isNullGid = gidRaw === null || gidRaw === undefined;
  if ((GLOBAL_ROLE_KEYS as readonly string[]).includes(key)) {
    if (!isNullGid) return null;
    return { role_key: key as GlobalRoleKey, group_id: null };
  }
  if ((SCOPED_ROLE_KEYS as readonly string[]).includes(key)) {
    if (isNullGid) return null;
    const gid = Number(gidRaw);
    if (!Number.isFinite(gid) || !Number.isInteger(gid) || gid <= 0) return null;
    return { role_key: key as ScopedRoleKey, group_id: gid };
  }
  return null;
}

const isGlobalRoleRow = (r: KaryawanRoleRow): r is GlobalRoleRow =>
  r.group_id === null;

export type AuthAccountRole = 'admin' | 'hr' | 'employee';
export type AuthSubjectType = 'account' | 'employee_nip' | 'legacy_pin' | 'karyawan_id';

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

type AuthContextBase = {
  pin: string;
  nama: string;
  privilege: number;
  is_admin: boolean;
  is_hr: boolean;
  is_leader: boolean;
  can_schedule: boolean;
  can_dashboard: boolean;
  groups: GroupAccess[];
  canonical_roles: CanonicalEmployeeRole[];
};

export type AccountAuthContext = AuthContextBase & {
  subject_type: 'account';
  account_id: number;
  login_id: string;
  role_key: AuthAccountRole;
};

export type EmployeeAuthContext = AuthContextBase & {
  subject_type: 'employee_nip';
  karyawan_id: number;
  nip: string;
};

export type LegacyPinAuthContext = AuthContextBase & {
  subject_type: 'legacy_pin';
};

export type AuthContext =
  | AccountAuthContext
  | EmployeeAuthContext
  | LegacyPinAuthContext;

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
  employee: {
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
  if (normalized === 'employee') return 'employee';

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
          : /^\d+$/.test(payload.subject)
            ? 'karyawan_id'
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
  if (subjectType === 'karyawan_id') {
    // T9: subject is the bare numeric karyawan_id (no prefix). Trim defensively.
    return String(subject ?? '').trim();
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
      'SELECT a.karyawan_id, a.nip, k.nama, k.pin, k.nip AS karyawan_nip FROM tb_karyawan_auth a JOIN tb_karyawan k ON a.karyawan_id = k.id WHERE a.nip = ? AND a.is_active = 1 AND k.isDeleted = 0',
      [nip]
    );

    if (!Array.isArray(users) || users.length === 0) return null;
    const user = (users as KaryawanAuthRow[])[0];

    if (isPlaceholderEmployeeNip(user.karyawan_nip)) return null;

    const [roles] = await connection.query(
      'SELECT role_key, group_id FROM tb_karyawan_roles WHERE karyawan_id = ?',
      [user.karyawan_id]
    );
    const rawRoleRows: RawKaryawanRoleRow[] = Array.isArray(roles) ? (roles as RawKaryawanRoleRow[]) : [];
    const roleRows: KaryawanRoleRow[] = rawRoleRows
      .map(narrowRoleRow)
      .filter((r): r is KaryawanRoleRow => r !== null);
    const LEADER_ROLE_KEYS = ['group_leader'];

    // B2: admin/hr are global ONLY when granted by a global-scope role row
    // (group_id IS NULL). A group-scoped admin/hr row must not confer global rights.
    const is_admin = roleRows.some((r) => r.role_key === 'admin' && isGlobalRoleRow(r));
    const is_hr = roleRows.some((r) => r.role_key === 'hr' && isGlobalRoleRow(r));
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
        if (isGlobalRoleRow(r)) continue;
        if (!['group_leader', 'employee'].includes(r.role_key)) continue;
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

    }

    return {
      nip: user.nip,
      pin: user.pin || user.nip,
      karyawan_id: Number(user.karyawan_id),
      nama: user.nama || user.nip,
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

// Mirrors createAuthContextByNip; keyed by immutable karyawan_id for the
// re-anchor migration. Intentional SQL divergence: adds k.isDeleted = 0.
export async function createAuthContextByKaryawanId(
  karyawanId: number,
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
      'SELECT a.karyawan_id, a.nip, k.nama, k.pin, k.nip AS karyawan_nip FROM tb_karyawan_auth a JOIN tb_karyawan k ON a.karyawan_id = k.id WHERE k.id = ? AND a.is_active = 1 AND k.isDeleted = 0',
      [karyawanId]
    );

    if (!Array.isArray(users) || users.length === 0) return null;
    const user = (users as KaryawanAuthRow[])[0];

    if (isPlaceholderEmployeeNip(user.karyawan_nip)) return null;

    const [roles] = await connection.query(
      'SELECT role_key, group_id FROM tb_karyawan_roles WHERE karyawan_id = ?',
      [user.karyawan_id]
    );
    const rawRoleRows: RawKaryawanRoleRow[] = Array.isArray(roles) ? (roles as RawKaryawanRoleRow[]) : [];
    const roleRows: KaryawanRoleRow[] = rawRoleRows
      .map(narrowRoleRow)
      .filter((r): r is KaryawanRoleRow => r !== null);
    const LEADER_ROLE_KEYS = ['group_leader'];

    // B2: admin/hr are global ONLY when granted by a global-scope role row
    // (group_id IS NULL). A group-scoped admin/hr row must not confer global rights.
    const is_admin = roleRows.some((r) => r.role_key === 'admin' && isGlobalRoleRow(r));
    const is_hr = roleRows.some((r) => r.role_key === 'hr' && isGlobalRoleRow(r));
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
        if (isGlobalRoleRow(r)) continue;
        if (!['group_leader', 'employee'].includes(r.role_key)) continue;
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

    }

    return {
      nip: user.nip,
      pin: user.pin || user.nip,
      karyawan_id: Number(user.karyawan_id),
      nama: user.nama || user.nip,
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
    console.error('Error in createAuthContextByKaryawanId:', error);
    return null;
  } finally {
    if (shouldRelease && connection) connection.release();
  }
}

export async function getAuthContextFromCookies(): Promise<AuthContext | null> {
  const cookieStore = await getCookieStore();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const payload = decodeSession(token);
  if (!payload) return null;

  const normalizedSubjectType = normalizeSubjectType(payload.subject_type);

  // T9: canonical post-migration subject — numeric karyawan_id, ungated (the new normal).
  // Both login lanes now write `st='karyawan_id'` + numeric `sub`. Account lane resolves karyawan_id
  // from auth_accounts.karyawan_id (when linked); NIP lane from tb_karyawan_auth.karyawan_id.
  if (normalizedSubjectType === 'karyawan_id') {
    const raw = getSubjectValueForType(payload.subject, 'karyawan_id');
    const id = Number(raw);
    if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) return null;
    return createAuthContextByKaryawanId(id);
  }

  // In-flight pre-T9 cookies: explicit-typed payloads issued during a TTL window before this deploy.
  // Gated by EASYLINK_ENABLE_LEGACY_SESSION_PAYLOAD_COMPAT (T13 flips OFF after 12h soak).
  if (normalizedSubjectType === 'account') {
    if (!LEGACY_SESSION_PAYLOAD_COMPAT_ENABLED) return null;
    return createAuthContextByLoginId(getSubjectValueForType(payload.subject, 'account'));
  }
  if (normalizedSubjectType === 'employee_nip') {
    if (!LEGACY_SESSION_PAYLOAD_COMPAT_ENABLED) return null;
    return createAuthContextByNip(getSubjectValueForType(payload.subject, 'employee_nip'));
  }

  // Untyped legacy payloads (st missing): prefix-inferred. Same compat gate.
  if (!LEGACY_SESSION_PAYLOAD_COMPAT_ENABLED) return null;

  if (payload.subject.startsWith('account:')) {
    return createAuthContextByLoginId(payload.subject.slice('account:'.length));
  }
  if (payload.subject.startsWith('nip:')) {
    return createAuthContextByNip(payload.subject.slice('nip:'.length));
  }

  const accountContext = await createAuthContextByLoginId(payload.subject);
  if (accountContext) return accountContext;

  const nipContext = await createAuthContextByNip(payload.subject);
  if (nipContext) return nipContext;

  return null;
}

export function setAuthCookie(
  response: NextResponseType,
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

export function clearAuthCookie(response: NextResponseType, request: any = null) {
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
  if (!dbValue || !typed) return false;
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
  const accountRoleKey = auth.subject_type === 'account' ? auth.role_key : null;
  if (auth.is_leader) return 'Group Leader';
  if (accountRoleKey === 'employee') return 'Employee';
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

export async function unauthorizedResponse(message = 'Unauthorized') {
  const Res = await getNextResponse();
  return Res.json({ ok: false, error: message }, { status: 401 });
}

export async function forbiddenResponse(message = 'Forbidden') {
  const Res = await getNextResponse();
  return Res.json({ ok: false, error: message }, { status: 403 });
}

// ponytail: response-shape helpers for the {ok:false,error} family. Routes still hand-roll
// NextResponse.json inline (33/36) — these are the seam for incremental adoption, not a
// forced wrapper. Ceiling: if a route needs structured error fields (code/request_id like
// the hop-b path), keep its bespoke shape; do not force this family there.
export async function badRequestResponse(message = 'Bad request') {
  const Res = await getNextResponse();
  return Res.json({ ok: false, error: message }, { status: 400 });
}

export async function serverErrorResponse(message = 'Internal server error') {
  const Res = await getNextResponse();
  return Res.json({ ok: false, error: message }, { status: 500 });
}
