// Per-IP + per-login_id login rate limiter (in-memory, single-instance LAN).
// Grill H5: rate-limit IN (brute-force defense); CSRF token OUT (LAN-only +
// same-origin enforced in middleware.ts isValidOrigin). For multi-instance
// deployments, swap this Map for Redis.
//
// Chosen limit: 10 attempts per 60s sliding window per (ip + login_id) tuple.
// Rationale: high enough that legitimate retry/typo + QA harness loops pass,
// low enough that online brute-force is impractical. Middleware already caps
// 30/min/IP across all /api/auth/* (coarse), this is the fine-grained
// per-account guard so one attacker can't grind a single account.

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

/** @type {Map<string, number[]>} key -> timestamps of attempts in window */
const attemptStore = new Map();

let cleanupTimer = null;

function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS;
    for (const [key, timestamps] of attemptStore) {
      const kept = timestamps.filter((t) => t > cutoff);
      if (kept.length === 0) attemptStore.delete(key);
      else attemptStore.set(key, kept);
    }
  }, 5 * 60_000);
  // Don't keep the event loop alive purely for cleanup (Next.js dev mode).
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();
}

ensureCleanup();

export function getLoginClientIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

/**
 * Check whether a login attempt should be allowed. Records the attempt
 * regardless so that exactly MAX_ATTEMPTS successes are permitted and the
 * (MAX_ATTEMPTS + 1)th call returns { allowed: false }.
 *
 * @param {object} args
 * @param {string} args.ip - client ip (use getLoginClientIp)
 * @param {string} args.loginId - normalized login_id / nip
 * @param {number} [args.now] - injectable clock for tests
 * @returns {{ allowed: boolean, remaining: number, retryAfterSeconds: number }}
 */
export function checkLoginRateLimit({ ip, loginId, now = Date.now() }) {
  const key = `${ip}::${loginId}`;
  const cutoff = now - WINDOW_MS;
  const prev = attemptStore.get(key) || [];
  const recent = prev.filter((t) => t > cutoff);

  if (recent.length >= MAX_ATTEMPTS) {
    attemptStore.set(key, recent);
    const oldest = recent[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  recent.push(now);
  attemptStore.set(key, recent);
  return {
    allowed: true,
    remaining: MAX_ATTEMPTS - recent.length,
    retryAfterSeconds: 0,
  };
}

/** Test-only: wipe the store. Not exported via barrel. */
export function __resetLoginRateLimitForTests() {
  attemptStore.clear();
}

export const LOGIN_RATE_LIMIT_MAX = MAX_ATTEMPTS;
export const LOGIN_RATE_LIMIT_WINDOW_MS = WINDOW_MS;
