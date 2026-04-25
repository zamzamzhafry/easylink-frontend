export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import {
  forbiddenResponse,
  getAuthContextFromCookies,
  unauthorizedResponse,
} from '@/lib/auth-session';
import {
  getRecoveryTaskConfig,
  queryRecoveryTaskStatus,
  readOpsHealthSummary,
  startRecoveryTask,
} from '@/lib/ops-recovery';

async function ensureAdmin() {
  const auth = await getAuthContextFromCookies();
  if (!auth) return { error: unauthorizedResponse('Login required.') };
  if (!auth.is_admin) return { error: forbiddenResponse('Admin access required.') };
  return { auth };
}

async function buildPayload() {
  const [task, health_summary] = await Promise.all([
    queryRecoveryTaskStatus(),
    readOpsHealthSummary(),
  ]);

  return {
    ok: true,
    task,
    health_summary,
    config: getRecoveryTaskConfig(),
  };
}

export async function GET() {
  const guard = await ensureAdmin();
  if (guard.error) return guard.error;

  try {
    return NextResponse.json(await buildPayload());
  } catch (error) {
    console.error('Recovery status error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to load recovery task status.',
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  const guard = await ensureAdmin();
  if (guard.error) return guard.error;

  try {
    const trigger = await startRecoveryTask();
    const health_summary = await readOpsHealthSummary();

    return NextResponse.json({
      ok: true,
      started: trigger.started,
      message: trigger.message,
      task: trigger.task,
      health_summary,
      config: getRecoveryTaskConfig(),
    });
  } catch (error) {
    console.error('Recovery trigger error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to trigger recovery task.',
      },
      { status: 500 }
    );
  }
}
