import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { toMinutes } from '../lib/time.js';

describe('toMinutes', () => {
  test('parses valid HH:mm', () => {
    assert.equal(toMinutes('00:00'), 0);
    assert.equal(toMinutes('09:30'), 570);
    assert.equal(toMinutes('23:59'), 1439);
  });

  test('partial input treats missing part as 0 (Number("") === 0)', () => {
    // '9:' → [9, 0] → 540. ':30' → [0, 30] → 30. Documented edge: a truncated
    // time string does NOT return null — the empty half coerces to 0.
    assert.equal(toMinutes('9:'), 540);
    assert.equal(toMinutes(':30'), 30);
  });

  test('returns null for missing/empty/non-string', () => {
    assert.equal(toMinutes(''), null);
    assert.equal(toMinutes(null), null);
    assert.equal(toMinutes(undefined), null);
    assert.equal(toMinutes(930), null);
  });

  test('returns null for non-numeric parts', () => {
    assert.equal(toMinutes('ab:cd'), null);
    assert.equal(toMinutes('9:xx'), null);
  });

  test('does not enforce range (24h+) — caller validates', () => {
    // 25:99 parses numerically; range is the caller's concern, not this helper's.
    assert.equal(toMinutes('25:99'), 25 * 60 + 99);
  });
});
