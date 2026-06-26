import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The lib reads from process.cwd()/data/holidays — isolate by chdir to a tmp dir
// so tests don't touch real data and don't depend on cwd state.
const originalCwd = process.cwd();
let tmpDir;

function setupFiles(files) {
  tmpDir = mkdtempSync(join(tmpdir(), 'el-hol-'));
  const dataDir = join(tmpDir, 'data', 'holidays');
  mkdirSync(dataDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dataDir, name), JSON.stringify(content, null, 2));
  }
  process.chdir(tmpDir);
}

function reset() {
  process.chdir(originalCwd);
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
}

// Re-import fresh after chdir (ESM cache may hold first import).
async function loadLib() {
  // bust cache by using a fresh query
  const mod = await import(`../lib/id-holidays-fallback.js?v=${Date.now()}`);
  return mod;
}

describe('id-holidays-fallback', () => {
  test('merges fixed + yearly + custom (custom wins on date clash)', async () => {
    setupFiles({
      'fixed.json': [{ monthDay: '01-01', name: 'Tahun Baru', is_cuti_bersama: false }],
      '2026.json': [{ date: '2026-03-30', name: 'Idul Fitri', is_cuti_bersama: true }],
      'custom.json': [{ date: '2026-01-01', name: 'Company Holiday', is_national_holiday: false, is_cuti_bersama: false }],
    });
    const { fallbackIndonesianHolidays } = await loadLib();
    const rows = fallbackIndonesianHolidays(2026);

    // custom wins over fixed for 2026-01-01
    const nyd = rows.find((r) => r.date === '2026-01-01');
    assert.equal(nyd.name, 'Company Holiday', 'custom should override fixed');
    assert.equal(nyd.source, 'custom');

    // yearly present
    const fitri = rows.find((r) => r.date === '2026-03-30');
    assert.equal(fitri.name, 'Idul Fitri');

    reset();
  });

  test('getCustomHolidays filters by year prefix', async () => {
    setupFiles({
      'custom.json': [
        { date: '2026-06-01', name: 'A', is_cuti_bersama: false },
        { date: '2025-06-01', name: 'B', is_cuti_bersama: false },
      ],
    });
    const { fallbackIndonesianHolidays } = await loadLib();
    const rows = fallbackIndonesianHolidays(2026);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'A');
    reset();
  });

  test('missing files return empty arrays (no throw)', async () => {
    setupFiles({});
    const { fallbackIndonesianHolidays } = await loadLib();
    const rows = fallbackIndonesianHolidays(2026);
    assert.deepEqual(rows, []);
    reset();
  });

  test('corrupt JSON returns empty (no throw)', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'el-hol-'));
    const dataDir = join(tmpDir, 'data', 'holidays');
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, 'fixed.json'), 'NOT VALID JSON{{{');
    process.chdir(tmpDir);
    const { fallbackIndonesianHolidays } = await loadLib();
    const rows = fallbackIndonesianHolidays(2026);
    assert.deepEqual(rows, []);
    reset();
  });

  test('saveCustomHolidays writes + readCustomHolidays round-trips', async () => {
    setupFiles({});
    const { saveCustomHolidays, readCustomHolidays } = await loadLib();
    const payload = [{ date: '2026-07-01', name: 'Test', is_national_holiday: false, is_cuti_bersama: true }];
    saveCustomHolidays(payload);
    assert.deepEqual(readCustomHolidays(), payload);
    reset();
  });
});
