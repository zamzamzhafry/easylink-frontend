import { NextResponse } from 'next/server';
import { fallbackIndonesianHolidays } from '@/lib/id-holidays-fallback';

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
    is_national_holiday: true,
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
