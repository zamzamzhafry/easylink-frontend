import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import pool from '@/lib/db';

const SESSION_COOKIE = 'easylink_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h
const SECRET = process.env.AUTH_SECRET || 'dev-only-change-this-secret';

type SessionPayload = {
  pin: string;
  exp: number;
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
};

export type GroupAccess = {
  group_id: number;
  nama_group: string | null;
  can_schedule: boolean;
  can_dashboard: boolean;
};

export type AuthContext = {
  pin: string;
  nama: string;
  privilege: number;
  is_admin: boolean;
  can_schedule: boolean;
  can_dashboard: boolean;
  groups: GroupAccess[];
};

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
  const raw = base64UrlEncode(JSON.stringify(payload));
  return `${raw}.${sign(raw)}`;
}

function decodeSession(token?: string | null): SessionPayload | null {
  if (!token) return null;
  const [raw, signature] = token.split('.');
  if (!raw || !signature) return null;
  if (sign(raw) !== signature) return null;

  try {
    const decoded = JSON.parse(base64UrlDecode(raw));
    const pin = String(decoded?.pin ?? '').trim();
    const exp = Number(decoded?.exp ?? 0);
    if (!pin || !Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { pin, exp };
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

export async function createAuthContextByPin(pin: string): Promise<AuthContext | null> {
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
  const isAdmin = privilege >= 14;
  let groups: GroupAccess[] = [];

  if (!isAdmin && (await hasTable('tb_user_group_access'))) {
    const [rowsRaw] = await pool.query(
      `SELECT uga.group_id,
              g.nama_group,
              uga.can_schedule,
              uga.can_dashboard
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
    }));
  }

  return {
    pin: String(user.pin),
    nama: user.nama || `PIN ${user.pin}`,
    privilege,
    is_admin: isAdmin,
    can_schedule: isAdmin || groups.some((group) => group.can_schedule),
    can_dashboard: isAdmin || groups.some((group) => group.can_dashboard),
    groups,
  };
}

export async function getAuthContextFromCookies(): Promise<AuthContext | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const payload = decodeSession(token);
  if (!payload) return null;
  return createAuthContextByPin(payload.pin);
}

export function setAuthCookie(response: NextResponse, pin: string) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = encodeSession({ pin, exp });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
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
    secure: process.env.NODE_ENV === 'production',
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
  capability: 'schedule' | 'dashboard'
) {
  if (auth.is_admin) return true;
  const group = auth.groups.find((item) => Number(item.group_id) === Number(groupId));
  if (!group) return false;
  return capability === 'schedule' ? group.can_schedule : group.can_dashboard;
}

export function getAllowedGroupIds(
  auth: AuthContext,
  capability: 'schedule' | 'dashboard'
) {
  if (auth.is_admin) return null;
  return auth.groups
    .filter((group) => (capability === 'schedule' ? group.can_schedule : group.can_dashboard))
    .map((group) => Number(group.group_id));
}

export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json({ ok: false, error: message }, { status: 401 });
}

export function forbiddenResponse(message = 'Forbidden') {
  return NextResponse.json({ ok: false, error: message }, { status: 403 });
}
