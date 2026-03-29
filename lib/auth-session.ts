import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import {
  LEGACY_EMPLOYEE_ROLE_TO_CANONICAL_ROLE,
  type CanonicalEmployeeRole,
} from '@/lib/domain/employee-auth-model';

const SESSION_COOKIE = 'easylink_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h

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
const SECRET = process.env.AUTH_SECRET || 'dev-only-change-this-secret';

type SessionPayload = {
  subject: string;
  exp: number;
  payload_format: 'canonical' | 'legacy';
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

function sign(raw: string) {
  return crypto.createHmac('sha256', SECRET).update(raw).digest('base64url');
}

function encodeSession(payload: SessionPayload) {
  const encodedPayload = {
    sub: payload.subject,
    exp: payload.exp,
    v: 2,
  };
  const raw = base64UrlEncode(JSON.stringify(encodedPayload));
  return `${raw}.${sign(raw)}`;
}

function decodeSession(token?: string | null): SessionPayload | null {
  if (!token) return null;
  const [raw, signature] = token.split('.');
  if (!raw || !signature) return null;
  if (sign(raw) !== signature) return null;

  try {
    const decoded = JSON.parse(base64UrlDecode(raw));
    const exp = Number(decoded?.exp ?? 0);

    if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    const canonicalSubject = String(decoded?.sub ?? '').trim();
    if (canonicalSubject) {
      return {
        subject: canonicalSubject,
        exp,
        payload_format: 'canonical',
      };
    }

    const legacyPin = String(decoded?.pin ?? '').trim();
    if (!legacyPin) {
      return null;
    }

    if (!LEGACY_SESSION_PAYLOAD_COMPAT_ENABLED) {
      return null;
    }

    return {
      subject: legacyPin,
      exp,
      payload_format: 'legacy',
    };
  } catch {
    return null;
  }
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

// NEW: Auth Restructure based on NIP
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

    if (users.length === 0) return null;
    const user = users[0];

    // Fetch roles
    const [roles] = await connection.query(
      'SELECT role_key, group_id FROM tb_karyawan_roles WHERE karyawan_id = ?',
      [user.karyawan_id]
    );
    const is_admin = roles.some((r: any) => r.role_key === 'admin');
    const is_leader = roles.some((r: any) => r.role_key === 'group_leader');
    const is_hr = roles.some((r: any) => r.role_key === 'hr');

    const legacyFlagSnapshot: LegacyAuthFlagSnapshot = {
      privilege: is_admin ? 4 : 1,
      is_admin,
      is_leader,
      is_hr,
      can_schedule: is_admin || is_leader,
      can_dashboard: is_admin || is_leader,
    };
    const canonical_roles = getCanonicalRolesFromLegacyAuth(
      legacyFlagSnapshot,
      (roles as any[]).map((r) => r.role_key)
    );

    // Fetch groups if leader
    let groups: any[] = [];
    if (is_leader) {
      const groupIds = roles
        .filter((r: any) => r.role_key === 'group_leader' && r.group_id)
        .map((r: any) => r.group_id);
      if (groupIds.length > 0) {
        const [groupRows] = await connection.query(
          'SELECT id as group_id, nama_group FROM tb_group WHERE id IN (?)',
          [groupIds]
        );
        groups = (groupRows as any[]).map((g: any) => ({
          group_id: g.group_id,
          nama_group: g.nama_group,
          can_schedule: 1,
          can_dashboard: 1,
          is_leader: true,
        }));
      }
    }

    return {
      nip: user.nip,
      pin: user.pin || user.nip,
      karyawan_id: user.karyawan_id,
      nama: user.nama,
      privilege: is_admin ? 4 : 1, // Legacy shim
      is_admin,
      is_leader,
      is_hr,
      can_schedule: is_admin || is_leader,
      can_dashboard: is_admin || is_leader,
      groups,
      canonical_roles,
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
  const [userRows] = await pool.query(
    `SELECT pin, nama, privilege
     FROM tb_user
     WHERE pin = ?
     LIMIT 1`,
    [pin]
  );
  const user = (Array.isArray(userRows) ? userRows[0] : null) as UserRow | null;

  if (!user) return null;

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
      can_schedule: Number(row.can_schedule ?? 0) === 1,
      can_dashboard: Number(row.can_dashboard ?? 0) === 1,
      is_leader: Number(row.is_leader ?? 0) === 1,
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
  };
}

export async function getAuthContextFromCookies(): Promise<AuthContext | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const payload = decodeSession(token);
  if (!payload) return null;

  // Try NIP-based auth first
  const nipContext = await createAuthContextByNip(payload.subject);
  if (nipContext) return nipContext;

  if (!LEGACY_PIN_FALLBACK_ENABLED) return null;

  // Fallback to legacy PIN-based auth
  return createAuthContextByPin(payload.subject);
}

export function setAuthCookie(response: NextResponse, pin: string) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = encodeSession({
    subject: pin,
    exp,
    payload_format: 'canonical',
  });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && process.env.ALLOW_INSECURE_COOKIES !== 'true',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearAuthCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && process.env.ALLOW_INSECURE_COOKIES !== 'true',
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
  if (auth.is_admin) return true;
  const group = auth.groups.find((item) => Number(item.group_id) === Number(groupId));
  if (!group) return false;
  if (capability === 'leader') return group.is_leader;
  return capability === 'schedule' ? group.can_schedule : group.can_dashboard;
}

export function getAllowedGroupIds(
  auth: AuthContext,
  capability: 'schedule' | 'dashboard' | 'leader'
) {
  if (auth.is_admin) return null;
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
