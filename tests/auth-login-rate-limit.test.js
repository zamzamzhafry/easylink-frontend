import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkLoginRateLimit,
  __resetLoginRateLimitForTests,
  LOGIN_RATE_LIMIT_MAX,
  LOGIN_RATE_LIMIT_WINDOW_MS,
} from '../lib/auth-login-rate-limit.js';

beforeEach(() => {
  __resetLoginRateLimitForTests();
});

describe('login rate limiter (ip + loginId)', () => {
  test('allows exactly LOGIN_RATE_LIMIT_MAX attempts then blocks the next', () => {
    const now = 1_000_000;
    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX; i++) {
      const r = checkLoginRateLimit({ ip: '10.0.0.1', loginId: 'admin01', now });
      assert.equal(r.allowed, true, `attempt ${i + 1} should be allowed`);
    }
    const blocked = checkLoginRateLimit({ ip: '10.0.0.1', loginId: 'admin01', now });
    assert.equal(blocked.allowed, false, '11th attempt must be blocked');
    assert.ok(blocked.retryAfterSeconds >= 1, 'retryAfter must be >= 1s');
    assert.ok(blocked.retryAfterSeconds <= 60, 'retryAfter must be <= window');
  });

  test('different loginId on same IP is NOT blocked by another account hitting the cap', () => {
    const now = 2_000_000;
    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX + 5; i++) {
      checkLoginRateLimit({ ip: '10.0.0.2', loginId: 'victim', now });
    }
    const other = checkLoginRateLimit({ ip: '10.0.0.2', loginId: 'bystander', now });
    assert.equal(other.allowed, true, 'unrelated account on same IP must remain allowed');
  });

  test('different IP on same loginId is NOT blocked by another IP hitting the cap', () => {
    const now = 3_000_000;
    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX + 5; i++) {
      checkLoginRateLimit({ ip: '10.0.0.3', loginId: 'admin01', now });
    }
    const other = checkLoginRateLimit({ ip: '10.0.0.4', loginId: 'admin01', now });
    assert.equal(other.allowed, true, 'different IP must remain allowed for same loginId');
  });

  test('window slides: attempts older than window are forgotten', () => {
    const t0 = 5_000_000;
    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX; i++) {
      checkLoginRateLimit({ ip: '10.0.0.5', loginId: 'slider', now: t0 });
    }
    const blocked = checkLoginRateLimit({ ip: '10.0.0.5', loginId: 'slider', now: t0 });
    assert.equal(blocked.allowed, false);

    const later = t0 + LOGIN_RATE_LIMIT_WINDOW_MS + 1;
    const allowedAgain = checkLoginRateLimit({ ip: '10.0.0.5', loginId: 'slider', now: later });
    assert.equal(allowedAgain.allowed, true, 'after window expiry must be allowed again');
  });

  test('reports decreasing remaining count', () => {
    const now = 7_000_000;
    const first = checkLoginRateLimit({ ip: '10.0.0.6', loginId: 'rem', now });
    assert.equal(first.remaining, LOGIN_RATE_LIMIT_MAX - 1);
    const second = checkLoginRateLimit({ ip: '10.0.0.6', loginId: 'rem', now });
    assert.equal(second.remaining, LOGIN_RATE_LIMIT_MAX - 2);
  });
});
