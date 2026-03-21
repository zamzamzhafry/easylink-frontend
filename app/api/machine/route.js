import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import {
  forbiddenResponse,
  getAuthContextFromCookies,
  unauthorizedResponse,
} from '@/lib/auth-session';
import {
  getDeviceInfoFromSdk,
  getDeviceTimeFromSdk,
  pullUsersFromSdk,
  syncDeviceTimeFromSdk,
} from '@/lib/easylink-sdk-client';

async function importUsersToTbUser(users) {
  if (!users.length) return { inserted: 0, updated: 0 };

  const defaultPwd = process.env.EASYLINK_DEFAULT_USER_PASSWORD || '1234';
  let inserted = 0;
  let updated = 0;

  for (const user of users) {
    const [result] = await pool.query(
      `
        INSERT INTO tb_user (pin, nama, pwd, rfid, privilege)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          nama = VALUES(nama),
          rfid = VALUES(rfid),
          privilege = VALUES(privilege)
      `,
      [user.pin, user.nama, defaultPwd, user.rfid || '', Number(user.privilege || 0)]
    );

    if (result.affectedRows === 1) inserted += 1;
    if (result.affectedRows > 1) updated += 1;
  }

  return { inserted, updated };
}

export async function GET(request) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin) return forbiddenResponse('Admin only');

  const url = new URL(request.url);
  const action = (url.searchParams.get('action') || 'info').toLowerCase();
  const source = (url.searchParams.get('source') || 'auto').toLowerCase();

  if (action === 'info') {
    const result = await getDeviceInfoFromSdk({ source });
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === 'time') {
    const result = await getDeviceTimeFromSdk({ source });
    return NextResponse.json({ ok: true, ...result });
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
}

export async function POST(req) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin) return forbiddenResponse('Admin only');

  const body = await req.json().catch(() => ({}));
  const action = (body?.action || '').toLowerCase();
  const source = (body?.source || 'auto').toLowerCase();

  if (action === 'sync_time') {
    const result = await syncDeviceTimeFromSdk({ source });
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === 'pull_users') {
    const result = await pullUsersFromSdk({ source });
    const imported = await importUsersToTbUser(result.rows);
    return NextResponse.json({
      ok: true,
      source: result.source,
      pulled_count: result.rows.length,
      inserted_count: imported.inserted,
      updated_count: imported.updated,
      users: result.rows,
    });
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
}
