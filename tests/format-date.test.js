import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { formatDateDisplay } from '../lib/format-date.js';

describe('formatDateDisplay', () => {
  test('formats a valid ISO date', () => {
    const out = formatDateDisplay('2026-06-24');
    // id-ID format: "24 Jun 2026" (locale may vary in CI, so check components).
    assert.match(out, /24/);
    assert.match(out, /2026/);
  });

  test('returns "-" for empty/null/undefined', () => {
    assert.equal(formatDateDisplay(''), '-');
    assert.equal(formatDateDisplay(null), '-');
    assert.equal(formatDateDisplay(undefined), '-');
  });

  test('returns input string for non-date garbage (isNaN fallback)', () => {
    assert.equal(formatDateDisplay('not-a-date'), 'not-a-date');
  });

  test('parses date-only as local midnight, not UTC midnight', () => {
    // The bug this guards: new Date('2026-06-24') parses as UTC 00:00, which
    // in UTC-X timezones toLocaleDateString renders the previous day. We append
    // T00:00:00 so parsing is local. Assert the day-of-month is 24, not 23.
    const out = formatDateDisplay('2026-06-24');
    assert.match(out, /^24\b/, `expected day 24, got: ${out}`);
  });
});
