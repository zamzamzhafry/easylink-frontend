import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveDateRange } from '../lib/date-range.js';

describe('resolveDateRange', () => {
  test('valid range returns from/to', () => {
    const r = resolveDateRange('2026-06-01', '2026-06-24');
    assert.deepEqual(r, { from: '2026-06-01', to: '2026-06-24' });
  });

  test('defaults missing from to today, to to from', () => {
    const r = resolveDateRange(null, null);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(r.from));
    assert.equal(r.to, r.from);
    assert.equal(r.error, undefined);
  });

  test('rejects non-date format (falls back rather than error)', () => {
    // Non-date from → fallback to today; non-date to → fallback to from.
    const r = resolveDateRange('garbage', '2026-06-24');
    assert.equal(r.error, undefined);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(r.from));
  });

  test('rejects from > to', () => {
    const r = resolveDateRange('2026-06-24', '2026-06-01');
    assert.equal(r.error, '"from" must be on or before "to".');
    assert.equal(r.status, 400);
  });

  test('rejects range exceeding 366 days', () => {
    const r = resolveDateRange('2024-01-01', '2026-06-24');
    assert.ok(r.error.includes('exceeds'), `got: ${r.error}`);
    assert.equal(r.status, 400);
  });

  test('allows exactly 366 days (boundary)', () => {
    // 2024 is a leap year: 2024-01-01 + 366 days = 2025-01-01.
    const r = resolveDateRange('2024-01-01', '2025-01-01');
    assert.equal(r.error, undefined);
    assert.equal(r.from, '2024-01-01');
  });

  test('honors custom maxRangeDays', () => {
    const r = resolveDateRange('2026-06-01', '2026-06-15', { maxRangeDays: 7 });
    assert.ok(r.error?.includes('exceeds'), `got: ${r.error}`);
    assert.equal(r.status, 400);
  });
});
