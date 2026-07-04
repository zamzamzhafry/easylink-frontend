/**
 * POST /api/scanlog/fetch — on-demand pull from the remote easylink-fetcher.
 *
 * Admin-cookie auth. Calls fetcher (Cloudflare Tunnel) → device → returns
 * HOP_B records → prod writes them to tb_scanlog_safe_events via the shared
 * insertHopBSafeEvents (INSERT IGNORE dedup). Both-services-talk proof.
 *
 * Env: FETCHER_URL, FETCHER_TOKEN (set on prod).
 */

import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import {
  forbiddenResponse,
  getAuthContextFromCookies,
  unauthorizedResponse,
} from '@/lib/auth-session';
import { insertHopBSafeEvents } from '@/lib/hop-b-ingest-writer';
import { buildHopBSourceEventKey } from '@/lib/hop-b-ingest-contract';
import { randomUUID } from 'node:crypto';
import { fetchScanlogsFromFetcher, FETCHER_SOURCE_SDK } from '@/lib/fetcher-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function toBoundedInt(v, def, min, max) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

export async function POST(request) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin) return forbiddenResponse('Admin only');

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 }); }

  const sn   = typeof body?.sn === 'string' ? body.sn.trim() : '';
  const from = typeof body?.from === 'string' ? body.from.trim() : '';
  const to   = typeof body?.to === 'string' ? body.to.trim() : '';
  const limit = toBoundedInt(body?.limit, 1000, 1, 5000);

  if (!sn)   return NextResponse.json({ ok: false, error: 'sn required' }, { status: 400 });
  if (!from) return NextResponse.json({ ok: false, error: 'from required' }, { status: 400 });

  // 1. Call the fetcher.
  let fetched;
  try {
    fetched = await fetchScanlogsFromFetcher({ sn, from, to, limit });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.code === 'FETCHER_UNCONFIGURED' ? e.message : 'FETCHER_UNREACHABLE', detail: e.message }, { status: 502 });
  }
  if (!fetched.ok) {
    return NextResponse.json({ ok: false, error: fetched.error, upstreamStatus: fetched.upstreamStatus, body: fetched.body?.slice(0, 300) }, { status: 502 });
  }

  // 2. Normalize records: ensure source_event_key + source_sdk for the writer.
  const records = fetched.records.map((r) => ({
    device_sn: r.device_sn,
    scan_date: r.scan_date,
    scan_time: r.scan_time,
    pin: r.pin,
    verify_mode: r.verify_mode,
    io_mode: r.io_mode,
    workcode: r.workcode,
    source_sdk: FETCHER_SOURCE_SDK,
    source_event_key: r.source_event_key || buildHopBSourceEventKey(r),
  }));

  if (records.length === 0) {
    return NextResponse.json({ ok: true, sn, fetched: 0, inserted: 0, duplicate: 0, from, to });
  }

  // 3. Write via shared INSERT IGNORE path (dedup on source_event_key).
  // batch_id = a fetcher-pull UUID (no tb_hop_b_ingest_log row for on-demand).
  const batchId = randomUUID();
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const affected = await insertHopBSafeEvents(conn, { ingestLogId: batchId, records });
    await conn.commit();
    const duplicate = records.length - affected;
    return NextResponse.json({ ok: true, sn, fetched: records.length, inserted: affected, duplicate, batch_id: batchId, from, to });
  } catch (e) {
    if (conn) { try { await conn.rollback(); } catch {} }
    return NextResponse.json({ ok: false, error: 'DB_WRITE_FAILED', detail: e.message }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}

export async function GET() {
  // Liveness / config probe for the e2e test.
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin) return forbiddenResponse('Admin only');
  return NextResponse.json({ ok: true, fetcher_url_set: !!process.env.FETCHER_URL, fetcher_token_set: !!process.env.FETCHER_TOKEN });
}
