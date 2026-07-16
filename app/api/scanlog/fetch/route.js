/**
 * POST /api/scanlog/fetch — on-demand raw pull from the remote easylink-fetcher.
 *
 * Option A (dump-raw-then-app-cleans):
 *   1. Admin-cookie auth.
 *   2. Call fetcher /fetch → device rows returned VERBATIM (raw_rows).
 *   3. INSERT IGNORE raw rows into tb_raw_scanlog (landing dedup on natural_key).
 *   4. Inline clean pass → tb_scanlog_safe_events (validate/dedup/invalid-date).
 * Raw rows are never lost, so the clean pass is replayable via /clean-pass.
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
import { fetchRawScanlogsFromFetcher } from '@/lib/fetcher-client';
import { landRawRows, runCleanPass } from '@/lib/scanlog-clean-pass';

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

  // 1. Call the fetcher — raw device rows verbatim.
  let fetched;
  try {
    fetched = await fetchRawScanlogsFromFetcher({ sn, from, to, limit });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.code === 'FETCHER_UNCONFIGURED' ? e.message : 'FETCHER_UNREACHABLE', detail: e.message }, { status: 502 });
  }
  if (!fetched.ok) {
    return NextResponse.json({ ok: false, error: fetched.error, upstreamStatus: fetched.upstreamStatus, body: fetched.body?.slice(0, 300) }, { status: 502 });
  }

  if (fetched.rawRows.length === 0) {
    return NextResponse.json({ ok: true, sn, fetched: 0, landed: 0, inserted: 0, duplicate: 0, invalid: 0, from, to });
  }

  // 2. Land raw rows verbatim, then 3. inline clean pass.
  try {
    const landed = await landRawRows({ deviceSn: sn, rawRows: fetched.rawRows });
    const clean = await runCleanPass({ limit: 5000 });
    return NextResponse.json({
      ok: true, sn, from, to,
      fetched: fetched.rawRows.length,
      landed: landed.landed,
      landedDuplicate: landed.duplicate,
      scanned: clean.scanned,
      inserted: clean.inserted,
      duplicate: clean.duplicate,
      invalid: clean.invalid,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'DB_WRITE_FAILED', detail: e.message }, { status: 500 });
  }
}

export async function GET() {
  // Liveness / config probe for the e2e test.
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin) return forbiddenResponse('Admin only');
  return NextResponse.json({ ok: true, fetcher_url_set: !!process.env.FETCHER_URL, fetcher_token_set: !!process.env.FETCHER_TOKEN });
}
