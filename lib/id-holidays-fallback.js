import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data', 'holidays');

/* ── JSON readers ─────────────────────────────────────────── */

function readJsonFile(filename) {
  const filePath = join(DATA_DIR, filename);
  if (!existsSync(filePath)) return [];
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return [];
  }
}

function writeJsonFile(filename, data) {
  const filePath = join(DATA_DIR, filename);
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/* ── Fixed holidays (recur every year) ────────────────────── */

function getFixedHolidays(year) {
  const fixed = readJsonFile('fixed.json');
  return fixed.map((item) => ({
    date: `${year}-${item.monthDay}`,
    name: item.name,
    is_national_holiday: true,
    is_cuti_bersama: Boolean(item.is_cuti_bersama),
    source: 'fixed',
  }));
}

/* ── Yearly holidays (year-specific JSON files) ───────────── */

function getYearlyHolidays(year) {
  const yearly = readJsonFile(`${year}.json`);
  return yearly.map((item) => ({
    date: item.date,
    name: item.name,
    is_national_holiday: true,
    is_cuti_bersama: Boolean(item.is_cuti_bersama),
    source: 'yearly',
  }));
}

/* ── Custom holidays (user-editable) ──────────────────────── */

function getCustomHolidays(year) {
  const custom = readJsonFile('custom.json');
  return custom
    .filter((item) => String(item.date).startsWith(String(year)))
    .map((item) => ({
      date: item.date,
      name: item.name,
      is_national_holiday: Boolean(item.is_national_holiday ?? false),
      is_cuti_bersama: Boolean(item.is_cuti_bersama),
      source: 'custom',
    }));
}

export function readCustomHolidays() {
  return readJsonFile('custom.json');
}

export function saveCustomHolidays(holidays) {
  writeJsonFile('custom.json', holidays);
}

/* ── Public: merged fallback ──────────────────────────────── */

export function fallbackIndonesianHolidays(year) {
  const fixed = getFixedHolidays(year);
  const yearly = getYearlyHolidays(year);
  const custom = getCustomHolidays(year);

  const map = new Map();

  /* fixed < yearly < custom  (later wins) */
  [...fixed, ...yearly, ...custom].forEach((item) => {
    map.set(item.date, item);
  });

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
