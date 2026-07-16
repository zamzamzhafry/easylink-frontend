/**
 * POST /api/scanlog/clean-pass — manually re-run the clean pass over pending
 * tb_raw_scanlog rows. Replayability is the whole point of Option A: if the
 * transform logic changes or a bug is fixed, re-clean without re-pulling the
 * device. Idempotent (safe_events dedups on source_event_key).
 *
 * Admin-cookie auth.
 */

import { NextResponse } from 'next/server';
import {
  forbiddenResponse,
  getAuthContextFromCookies,
  unauthorizedResponse,
} from '@/lib/auth-session';
import { runCleanPass } from '@/lib/scanlog-clean-pass';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin) return forbiddenResponse('Admin only');

  try {
    const result = await runCleanPass({ limit: 5000 });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'CLEAN_PASS_FAILED', detail: e.message }, { status: 500 });
  }
}
