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
  initializeMachineFromSdk,
  pullUsersFromSdk,
  syncDeviceTimeFromSdk,
} from '@/lib/easylink-sdk-client';

function toBoundedInt(value, fallback, { min = 1, max = 100000 } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

const MACHINE_WORKER_CONCURRENCY = toBoundedInt(process.env.EASYLINK_MACHINE_WORKERS, 1, {
  min: 1,
  max: 4,
});
const MAX_MACHINE_JOBS = 120;

const pendingMachineJobs = [];
const machineJobs = new Map();
let activeMachineWorkers = 0;
let machineQueuePumping = false;
let machineJobCounter = 0;

function nowIso() {
  return new Date().toISOString();
}

function requiredInitPhrase() {
  const sn = String(process.env.EASYLINK_DEVICE_SN || '').trim();
  return sn ? `INITIALIZE MACHINE ${sn}` : 'INITIALIZE MACHINE';
}

function queueMeta() {
  return {
    concurrency: MACHINE_WORKER_CONCURRENCY,
    active: activeMachineWorkers,
    pending: pendingMachineJobs.length,
  };
}

function isTerminalStatus(status) {
  return ['success', 'failed', 'cancelled', 'rejected', 'not_supported'].includes(
    String(status || '').toLowerCase()
  );
}

function normalizeAction(value) {
  const action = String(value || '')
    .trim()
    .toLowerCase();
  const aliases = {
    info: 'info',
    device_info: 'info',
    time: 'time',
    device_time: 'time',
    sync_time: 'sync_time',
    set_time: 'sync_time',
    pull_users: 'pull_users',
    users: 'pull_users',
    initialize_machine: 'initialize_machine',
    init: 'initialize_machine',
  };

  return aliases[action] || '';
}

function stablePayloadString(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stablePayloadString(item)).join(',')}]`;

  const entries = Object.entries(value)
    .filter(([key]) => !['confirmation_text', 'confirmation_phrase'].includes(key))
    .sort(([a], [b]) => a.localeCompare(b));

  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stablePayloadString(item)}`)
    .join(',')}}`;
}

function createDedupeKey(action, payload) {
  return `${action}|windows-sdk|${stablePayloadString(payload || {})}`;
}

function trimJobCache() {
  if (machineJobs.size <= MAX_MACHINE_JOBS) return;

  const rows = [...machineJobs.values()].sort((a, b) => Number(b.id) - Number(a.id));
  for (const row of rows.slice(MAX_MACHINE_JOBS)) {
    machineJobs.delete(row.id);
  }
}

function serializeJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    action: job.action,
    source_sdk: job.source_sdk,
    status: job.status,
    error_message: job.error_message || null,
    result: job.result ?? null,
    request: job.request,
    dedupe_key: job.dedupe_key,
    cancel_requested: Boolean(job.cancel_requested),
    created_at: job.created_at,
    started_at: job.started_at || null,
    finished_at: job.finished_at || null,
  };
}

function findDuplicateJob(dedupeKey) {
  const rows = [...machineJobs.values()].sort((a, b) => Number(b.id) - Number(a.id));
  return (
    rows.find(
      (row) =>
        row.dedupe_key === dedupeKey &&
        ['queued', 'running', 'cancel_requested'].includes(row.status)
    ) || null
  );
}

function assertDangerConfirmation(action, payload) {
  if (action !== 'initialize_machine') return;

  const requiredPhrase = requiredInitPhrase();
  const provided = String(payload?.confirmation_text || '').trim();
  if (provided !== requiredPhrase) {
    const error = new Error(`Type exact confirmation phrase: ${requiredPhrase}`);
    error.status = 403;
    throw error;
  }
}

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

async function runMachineAction(action, payload = {}) {
  const source = 'windows-sdk';

  if (action === 'info') {
    const result = await getDeviceInfoFromSdk({ source });
    return {
      source: result.source,
      info: result.info ?? null,
      raw: result.raw ?? null,
    };
  }

  if (action === 'time') {
    const result = await getDeviceTimeFromSdk({ source });
    return {
      source: result.source,
      time: result.time ?? null,
      raw: result.raw ?? null,
    };
  }

  if (action === 'sync_time') {
    const result = await syncDeviceTimeFromSdk({ source });
    return {
      source: result.source,
      synced_at: result.synced_at ?? null,
      raw: result.raw ?? null,
    };
  }

  if (action === 'pull_users') {
    const limit = toBoundedInt(payload?.limit, 100, { min: 1, max: 1000 });
    const page = toBoundedInt(payload?.page, 1, { min: 1, max: 100000 });
    const maxPages = toBoundedInt(
      payload?.max_pages ?? payload?.maxPages ?? process.env.EASYLINK_USER_MAX_PAGES,
      1000,
      { min: 1, max: 100000 }
    );
    const result = await pullUsersFromSdk({ source, limit, page, maxPages });
    const imported = await importUsersToTbUser(result.rows);
    return {
      source: result.source,
      pulled_count: result.rows.length,
      inserted_count: imported.inserted,
      updated_count: imported.updated,
      users_preview: result.rows.slice(0, 10),
    };
  }

  if (action === 'initialize_machine') {
    const result = await initializeMachineFromSdk({ source });
    return {
      source: result.source,
      initialized: true,
      raw: result.raw ?? null,
    };
  }

  const error = new Error(`Unknown action: ${action}`);
  error.status = 400;
  throw error;
}

async function processMachineJob(jobId) {
  const job = machineJobs.get(jobId);
  if (!job || job.status !== 'queued') return;

  if (job.cancel_requested) {
    job.status = 'cancelled';
    job.finished_at = nowIso();
    return;
  }

  job.status = 'running';
  job.started_at = nowIso();

  try {
    const result = await runMachineAction(job.action, job.request || {});

    if (job.cancel_requested) {
      job.status = 'cancelled';
      job.result = {
        ...result,
        cancel_effective: false,
        note: 'Cancel requested while running; action may have completed already.',
      };
      job.finished_at = nowIso();
      return;
    }

    job.status = 'success';
    job.result = result;
    job.finished_at = nowIso();
  } catch (error) {
    job.status = 'failed';
    job.error_message = error?.message || String(error);
    job.finished_at = nowIso();
  }
}

async function pumpMachineQueue() {
  if (machineQueuePumping) return;
  machineQueuePumping = true;

  try {
    while (activeMachineWorkers < MACHINE_WORKER_CONCURRENCY && pendingMachineJobs.length > 0) {
      const jobId = pendingMachineJobs.shift();
      const job = machineJobs.get(jobId);
      if (!job || job.status !== 'queued') continue;

      activeMachineWorkers += 1;

      (async () => {
        try {
          await processMachineJob(jobId);
        } finally {
          activeMachineWorkers -= 1;
          void pumpMachineQueue();
        }
      })();
    }
  } finally {
    machineQueuePumping = false;
  }
}

function enqueueMachineJob(action, request) {
  const dedupeKey = createDedupeKey(action, request);
  const duplicate = findDuplicateJob(dedupeKey);
  if (duplicate) {
    return { job: duplicate, duplicate: true };
  }

  machineJobCounter += 1;
  const job = {
    id: machineJobCounter,
    action,
    source_sdk: 'windows-sdk',
    status: 'queued',
    error_message: null,
    result: null,
    request,
    dedupe_key: dedupeKey,
    cancel_requested: false,
    created_at: nowIso(),
    started_at: null,
    finished_at: null,
  };

  machineJobs.set(job.id, job);
  trimJobCache();
  pendingMachineJobs.push(job.id);
  void pumpMachineQueue();
  return { job, duplicate: false };
}

function cancelMachineJob(jobId) {
  const job = machineJobs.get(jobId);
  if (!job) return null;

  if (job.status === 'queued') {
    job.cancel_requested = true;
    job.status = 'cancelled';
    job.finished_at = nowIso();
    return job;
  }

  if (job.status === 'running') {
    job.cancel_requested = true;
    job.status = 'cancel_requested';
    return job;
  }

  return job;
}

export async function GET(request) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin) return forbiddenResponse('Admin only');

  const url = new URL(request.url);
  const jobIdParam = url.searchParams.get('job_id');

  if (jobIdParam) {
    const jobId = toBoundedInt(jobIdParam, 0, { min: 0, max: 2147483647 });
    if (!jobId) {
      return NextResponse.json({ ok: false, error: 'Invalid job_id' }, { status: 400 });
    }

    const job = serializeJob(machineJobs.get(jobId));
    if (!job) {
      return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      row: job,
      queue: queueMeta(),
      init_confirmation_phrase: requiredInitPhrase(),
    });
  }

  const rows = [...machineJobs.values()]
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, 30)
    .map(serializeJob);

  return NextResponse.json({
    ok: true,
    rows,
    queue: queueMeta(),
    init_confirmation_phrase: requiredInitPhrase(),
  });
}

export async function POST(req) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin) return forbiddenResponse('Admin only');

  const body = await req.json().catch(() => ({}));
  const actionRaw = String(body?.action || '')
    .trim()
    .toLowerCase();

  if (actionRaw === 'cancel_job' || actionRaw === 'cancel') {
    const jobId = toBoundedInt(body?.job_id, 0, { min: 0, max: 2147483647 });
    if (!jobId) {
      return NextResponse.json({ ok: false, error: 'Invalid job_id' }, { status: 400 });
    }

    const job = cancelMachineJob(jobId);
    if (!job) {
      return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      row: serializeJob(job),
      queue: queueMeta(),
      init_confirmation_phrase: requiredInitPhrase(),
    });
  }

  const action = normalizeAction(actionRaw);
  if (!action) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Unknown action',
        supported_actions: ['info', 'time', 'sync_time', 'pull_users', 'initialize_machine'],
      },
      { status: 400 }
    );
  }

  const requestPayload = {
    limit: body?.limit,
    page: body?.page,
    max_pages: body?.max_pages,
    maxPages: body?.maxPages,
    confirmation_text: body?.confirmation_text,
  };

  try {
    assertDangerConfirmation(action, requestPayload);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Danger confirmation failed',
        init_confirmation_phrase: requiredInitPhrase(),
      },
      { status: Number(error?.status) || 403 }
    );
  }

  const asyncMode = body?.async !== false;

  if (!asyncMode) {
    try {
      const result = await runMachineAction(action, requestPayload);
      return NextResponse.json({
        ok: true,
        action,
        status: 'success',
        result,
        init_confirmation_phrase: requiredInitPhrase(),
      });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          action,
          error: error?.message || String(error),
          init_confirmation_phrase: requiredInitPhrase(),
        },
        { status: Number(error?.status) || 500 }
      );
    }
  }

  const { job, duplicate } = enqueueMachineJob(action, requestPayload);
  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      duplicate,
      row: serializeJob(job),
      queue: queueMeta(),
      init_confirmation_phrase: requiredInitPhrase(),
    },
    { status: 202 }
  );
}
