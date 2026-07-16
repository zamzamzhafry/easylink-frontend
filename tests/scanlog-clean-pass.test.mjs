import assert from 'node:assert/strict';
import test from 'node:test';

const { cleanDeviceRow } = await import('../lib/scanlog-clean-pass.js');

const SN = 'Fio66208021230737';

test('cleanDeviceRow: valid device row -> HOP_B record', () => {
  const { record, error } = cleanDeviceRow(
    { PIN: '110', WorkCode: 0, SN: SN, VerifyMode: 1, ScanDate: '2026-03-27 23:20:04', IOMode: 2 },
    SN
  );
  assert.equal(error, null);
  assert.equal(record.device_sn, SN);
  assert.equal(record.scan_date, '2026-03-27');
  assert.equal(record.scan_time, '23:20:04');
  assert.equal(record.pin, '110');
  assert.equal(record.verify_mode, 1);
  assert.equal(record.io_mode, 2);
  assert.equal(record.workcode, 0);
  // source_event_key matches the shared contract formula
  assert.equal(record.source_event_key, `${SN}|2026-03-27|23:20:04|110|1|2|0`);
});

test('cleanDeviceRow: missing PIN rejected', () => {
  const { record, error } = cleanDeviceRow({ ScanDate: '2026-03-27 23:20:04' }, SN);
  assert.equal(record, null);
  assert.equal(error, 'missing PIN');
});

test('cleanDeviceRow: short ScanDate rejected', () => {
  const { record, error } = cleanDeviceRow({ PIN: '110', ScanDate: '2026-03-27' }, SN);
  assert.equal(record, null);
  assert.equal(error, 'missing/short ScanDate');
});

test('cleanDeviceRow: impossible calendar date rejected (Feb 30)', () => {
  const { record, error } = cleanDeviceRow({ PIN: '110', ScanDate: '2026-02-30 10:00:00' }, SN);
  assert.equal(record, null);
  assert.match(error, /invalid date/);
});

test('cleanDeviceRow: impossible time rejected (25:00)', () => {
  const { record, error } = cleanDeviceRow({ PIN: '110', ScanDate: '2026-03-27 25:00:00' }, SN);
  assert.equal(record, null);
  assert.match(error, /invalid date/);
});

test('cleanDeviceRow: string modes coerced to int', () => {
  const { record } = cleanDeviceRow(
    { PIN: '7', WorkCode: '3', SN, VerifyMode: '1', ScanDate: '2026-01-05 08:00:00', IOMode: '0' },
    SN
  );
  assert.equal(record.verify_mode, 1);
  assert.equal(record.io_mode, 0);
  assert.equal(record.workcode, 3);
});
