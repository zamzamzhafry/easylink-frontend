import { NextResponse } from 'next/server';
import {
  getAuthContextFromCookies,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/auth-session';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

const configUpdateSchema = z
  .object({
    scheduling: z.object({}).passthrough().optional(),
    device: z.object({}).passthrough().optional(),
  })
  .refine((data) => data.scheduling !== undefined || data.device !== undefined, {
    message: 'At least one of scheduling or device must be provided',
  });

const CONFIG_PATH = join(process.cwd(), 'data', 'config.json');

function readConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function writeConfig(config) {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/* ── GET  /api/config ─────────────────────────────────────── */
export async function GET() {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse('Login required.');
  if (!auth.is_admin) return forbiddenResponse('Only admin can view config.');

  try {
    const config = readConfig();
    return NextResponse.json({ ok: true, config });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err?.message) }, { status: 500 });
  }
}

/* ── PUT  /api/config  { scheduling?, device? } ───────────── */
export async function PUT(request) {
  const auth = await getAuthContextFromCookies();
  if (!auth) return unauthorizedResponse('Login required.');
  if (!auth.is_admin) return forbiddenResponse('Only admin can update config.');

  try {
    const body = await request.json();
    const result = configUpdateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid input', details: result.error.errors },
        { status: 400 }
      );
    }

    const current = readConfig();

    /* shallow‑merge each section */
    if (result.data.scheduling) {
      current.scheduling = { ...(current.scheduling || {}), ...result.data.scheduling };
    }
    if (result.data.device) {
      current.device = { ...(current.device || {}), ...result.data.device };
    }

    writeConfig(current);
    return NextResponse.json({ ok: true, config: current });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err?.message) }, { status: 500 });
  }
}
