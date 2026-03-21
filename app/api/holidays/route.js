import { NextResponse } from 'next/server';
import {
  fallbackIndonesianHolidays,
  readCustomHolidays,
  saveCustomHolidays,
} from '@/lib/id-holidays-fallback';

/* ── helpers ──────────────────────────────────────────────── */

function toIsoDate(value) {
  if (!value) return null;
  const text = String(value);
  const date = text.includes('T') ? text.slice(0, 10) : text;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function normalizeHolidayRow(row) {
  const date = toIsoDate(row?.holiday_date || row?.date);
  if (!date) return null;

  const name = row?.holiday_name || row?.summary || row?.name || 'Hari Libur';
  const lowerName = String(name).toLowerCase();
  const isCuti =
    Boolean(row?.is_cuti_bersama) ||
    Boolean(row?.isCutiBersama) ||
    lowerName.includes('cuti bersama');

  return {
    date,
    name,
    is_national_holiday: Boolean(row?.is_national_holiday ?? true),
    is_cuti_bersama: isCuti,
    source: row?.source || 'api',
  };
}

function mergeRows(primaryRows, fallbackRows) {
  const map = new Map();
  fallbackRows.forEach((row) => {
    map.set(row.date, row);
  });
  primaryRows.forEach((row) => {
    map.set(row.date, row);
  });
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/* ── GET  /api/holidays?year=YYYY ─────────────────────────── */

export async function GET(request) {
  const url = new URL(request.url);
  const year = Number(url.searchParams.get('year') || new Date().getFullYear());

  const fallbackRows = fallbackIndonesianHolidays(year);

  try {
    const response = await fetch(
      'https://raw.githubusercontent.com/guangrei/APIHariLibur_V2/main/holidays.json',
      { next: { revalidate: 86400 } }
    );

    if (!response.ok) {
      return NextResponse.json({ ok: true, source: 'fallback', rows: fallbackRows });
    }

    const payload = await response.json();
    const rows = Object.entries(payload || {})
      .filter(([key]) => String(key).startsWith(String(year)))
      .map(([key, value]) => {
        if (typeof value === 'string') {
          return normalizeHolidayRow({ date: key, name: value });
        }
        return normalizeHolidayRow({ date: key, ...(value || {}) });
      })
      .filter(Boolean);

    const merged = mergeRows(rows, fallbackRows);
    return NextResponse.json({ ok: true, source: 'guangrei+fallback', rows: merged });
  } catch {
    return NextResponse.json({ ok: true, source: 'fallback', rows: fallbackRows });
  }
}

/* ── POST  /api/holidays  { date, name, is_cuti_bersama? } ── */

export async function POST(request) {
  try {
    const body = await request.json();
    const date = toIsoDate(body?.date);
    const name = (body?.name || '').trim();

    if (!date) {
      return NextResponse.json({ ok: false, error: 'Invalid date (YYYY-MM-DD)' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ ok: false, error: 'Name is required' }, { status: 400 });
    }

    const custom = readCustomHolidays();
    const existing = custom.findIndex((h) => h.date === date);

    const entry = {
      date,
      name,
      is_national_holiday: Boolean(body?.is_national_holiday ?? false),
      is_cuti_bersama: Boolean(body?.is_cuti_bersama ?? false),
    };

    if (existing >= 0) {
      custom[existing] = entry;
    } else {
      custom.push(entry);
    }

    custom.sort((a, b) => a.date.localeCompare(b.date));
    saveCustomHolidays(custom);

    return NextResponse.json({ ok: true, entry, total: custom.length });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err?.message) }, { status: 500 });
  }
}

/* ── DELETE  /api/holidays  { date } ─────────────────────── */

export async function DELETE(request) {
  try {
    const body = await request.json();
    const date = toIsoDate(body?.date);

    if (!date) {
      return NextResponse.json({ ok: false, error: 'Invalid date (YYYY-MM-DD)' }, { status: 400 });
    }

    const custom = readCustomHolidays();
    const filtered = custom.filter((h) => h.date !== date);

    if (filtered.length === custom.length) {
      return NextResponse.json({ ok: false, error: 'Custom holiday not found' }, { status: 404 });
    }

    saveCustomHolidays(filtered);

    return NextResponse.json({ ok: true, deleted: date, total: filtered.length });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err?.message) }, { status: 500 });
  }
}
