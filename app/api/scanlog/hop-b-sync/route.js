// HOP B sync — php8-style direct device pull.
//
// Separate path from the legacy /api/scanlog/sync (Windows-SDK multi-adapter).
// This route uses lib/sdk-device-client.js: POST sn&limit, IsSession loop,
// {Data,Result,IsSession} — the proven contract from easylink-sdk-study/php8-sample.
//
// Admin-only. Pulls all pages, inserts into tb_scanlog with INSERT IGNORE
// (idempotent re-runs). Returns counts + last scan time.
import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import {
  getAuthContextFromCookies,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/auth-session';
import { pullDeviceScanlogs } from '@/lib/sdk-device-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function ok(body) {
  return NextResponse.json({ ok: true, ...body }, { headers: { 'Cache-Control': 'no-store' } });
}

// Map a device entry (php8 shape: PIN/Time/VerifyMode/IOMode/WorkCode/SN) to a
// tb_scanlog row. Mirrors lib/easylink-sdk-client normalizeScanlog fields.
function toScanlogRow(entry, fallbackSn) {
  const sn = String(entry?.sn || entry?.SN || entry?.deviceSN || fallbackSn || '');
  const pin = String(entry?.pin || entry?.PIN || '').trim();
  const verifyMode = Number(entry?.verifyMode ?? entry?.verifymode ?? entry?.VerifyMode ?? 0);
  const ioMode = Number(entry?.ioMode ?? entry?.iomode ?? entry?.IOMode ?? 0);
  const workcode = Number(entry?.workcode ?? entry?.WorkCode ?? 0);
  // php8 sample uses Time; some SDKs use ScanDate/scan_date. Accept both.
  const when = entry?.Time || entry?.time || entry?.ScanDate || entry?.scan_date || null;
  return [sn, pin, when, verifyMode, ioMode, workcode];
}

export async function POST(req) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse('Login required.');
  if (!auth?.is_admin) return forbiddenResponse('Admin only.');

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit')) || 100;
  const maxPages = Number(url.searchParams.get('max_pages')) || 200;

  let pulled = 0;
  let inserted = 0;
  let lastScan = null;
  let deviceSn = null;
  let lastError = null;

  try {
    for await (const entry of pullDeviceScanlogs({ db: pool, fetch: globalThis.fetch, limit, maxPages })) {
      pulled += 1;
      if (!deviceSn) deviceSn = String(entry?.sn || entry?.SN || '');
      const row = toScanlogRow(entry, deviceSn);
      if (!row[1] || !row[2]) continue; // skip entries without pin/time
      if (row[2] && (!lastScan || row[2] > lastScan)) lastScan = row[2];
      try {
        const [res] = await pool.query(
          'INSERT IGNORE INTO tb_scanlog (sn, pin, scan_date, verifymode, iomode, workcode) VALUES (?, ?, ?, ?, ?, ?)',
          row
        );
        if (res?.affectedRows) inserted += 1;
      } catch (e) {
        lastError = e.message;
      }
    }
    return ok({ pulled, inserted, lastScan, deviceSn, lastError });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e.message, pulled, inserted, lastError },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
