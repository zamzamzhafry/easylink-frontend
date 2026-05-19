import { NextResponse } from 'next/server';
import {
  forbiddenResponse,
  getAuthContextFromCookies,
  unauthorizedResponse,
} from '@/lib/auth-session';

export const dynamic = 'force-dynamic';

const PHP_BRIDGE_URL = String(
  process.env.EASYLINK_PHP_BRIDGE_URL || 'http://localhost:9090'
).replace(/\/+$/, '');

const ALLOWED_ACTIONS = [
  'dev_info',
  'dev_settime',
  'sync_users',
  'sync_scanlogs',
  'db_stats',
  'machines_list',
  'machine_save',
  'machine_delete',
  'machine_test',
  'user_all',
  'scanlog_new',
  'scanlog_all',
];

const DANGER_ACTIONS = ['dev_init', 'dev_deladmin', 'user_delall', 'scanlog_del', 'log_del'];

const ALL_ACTIONS = [...ALLOWED_ACTIONS, ...DANGER_ACTIONS];

async function callPhp(action, { machine, method = 'GET', body, query = '' } = {}) {
  const params = new URLSearchParams();
  params.set('action', action);
  if (machine) params.set('machine', String(machine));
  if (query) {
    const extra = new URLSearchParams(query);
    for (const [k, v] of extra) params.set(k, v);
  }

  const url = `${PHP_BRIDGE_URL}/?${params.toString()}`;
  const opts = { method, headers: {} };

  if (method === 'POST' && body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (method === 'POST') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = '{}';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  opts.signal = controller.signal;

  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { ok: false, error: 'Non-JSON response from PHP bridge', raw: text.slice(0, 500) };
    }
    return { status: res.status, data };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { status: 504, data: { ok: false, error: 'PHP bridge timeout (120s)' } };
    }
    return { status: 502, data: { ok: false, error: `PHP bridge unreachable: ${err.message}` } };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();

  const url = new URL(request.url);
  const action = String(url.searchParams.get('action') || '').trim();
  const machine = url.searchParams.get('machine') || '';

  if (!action || !ALL_ACTIONS.includes(action)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid action', supported: ALL_ACTIONS },
      { status: 400 }
    );
  }

  if (DANGER_ACTIONS.includes(action)) {
    return NextResponse.json(
      { ok: false, error: 'Danger actions require POST' },
      { status: 405 }
    );
  }

  const query = url.searchParams.get('limit') ? `limit=${url.searchParams.get('limit')}` : '';
  const result = await callPhp(action, { machine, query });
  return NextResponse.json(result.data, { status: result.status === 200 ? 200 : result.status });
}

export async function POST(request) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse();
  if (!auth.is_admin) return forbiddenResponse('Admin only');

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || '').trim();
  const machine = body?.machine || '';

  if (!action || !ALL_ACTIONS.includes(action)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid action', supported: ALL_ACTIONS },
      { status: 400 }
    );
  }

  if (DANGER_ACTIONS.includes(action)) {
    const phrase = String(body?.confirmation_text || '').trim();
    const required = action.toUpperCase().replace(/_/g, ' ');
    if (phrase !== required) {
      return NextResponse.json(
        { ok: false, error: `Type confirmation phrase: ${required}`, required_phrase: required },
        { status: 403 }
      );
    }
  }

  const query = body?.full ? 'full=1' : '';
  const result = await callPhp(action, { machine, method: 'POST', body, query });
  return NextResponse.json(result.data, { status: result.status === 200 ? 200 : result.status });
}
