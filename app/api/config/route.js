import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

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
  try {
    const config = readConfig();
    return NextResponse.json({ ok: true, config });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err?.message) }, { status: 500 });
  }
}

/* ── PUT  /api/config  { scheduling?, device? } ───────────── */
export async function PUT(request) {
  try {
    const body = await request.json();
    const current = readConfig();

    /* shallow‑merge each section */
    if (body.scheduling) {
      current.scheduling = { ...(current.scheduling || {}), ...body.scheduling };
    }
    if (body.device) {
      current.device = { ...(current.device || {}), ...body.device };
    }

    writeConfig(current);
    return NextResponse.json({ ok: true, config: current });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err?.message) }, { status: 500 });
  }
}
