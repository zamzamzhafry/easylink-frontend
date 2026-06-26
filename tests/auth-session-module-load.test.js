// Regression guard for the lib/auth-session.ts ponytail (L5-9):
// the module MUST import clean under `node --test` (no next/headers/next/server
// at module top-level). Cookie I/O + Response helpers lazy-load inside their
// fns so the pure exports (rebuilders, verifyPlainPassword, role helpers) are
// reachable without a Next runtime. If a future edit moves `await
// import('next/headers')` to module scope, this test fails before the suite
// breaks across every auth-consuming route.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as authSession from '../lib/auth-session.ts';

test('lib/auth-session.ts loads under node --test (ponytail holds)', () => {
  // Module evaluated without throwing — the core invariant.
  assert.equal(typeof authSession, 'object');
});

test('pure exports are reachable without a Next runtime', () => {
  // These must be functions/values, not undefined — proves the lazy-load
  // boundary didn't swallow them and they don't require next/headers to import.
  assert.equal(typeof authSession.verifyPlainPassword, 'function');
  assert.equal(typeof authSession.createAuthContextByKaryawanId, 'function');
  assert.equal(typeof authSession.createAuthContextByNip, 'function');
  assert.equal(typeof authSession.createAuthContextByLoginId, 'function');
  assert.equal(typeof authSession.isPlaceholderEmployeeNip, 'function');
  assert.equal(typeof authSession.getCanonicalRolesFromLegacyAuth, 'function');
  assert.equal(Array.isArray(authSession.GLOBAL_ROLE_KEYS), true);
});

test('runtime-boundary exports exist but are not invoked at import time', () => {
  // getAuthContextFromCookies / setAuthCookie / unauthorizedResponse etc.
  // are exported (routes need them) but must not have fired next/headers
  // import yet — calling them would, but mere import must not.
  assert.equal(typeof authSession.getAuthContextFromCookies, 'function');
  assert.equal(typeof authSession.setAuthCookie, 'function');
  assert.equal(typeof authSession.unauthorizedResponse, 'function');
  assert.equal(typeof authSession.forbiddenResponse, 'function');
  // No next/headers load happened during this import: the lazy cache slot
  // is module-private, so we assert by absence of a thrown error above.
});

test('verifyPlainPassword works without any Next runtime (pure path)', () => {
  assert.equal(authSession.verifyPlainPassword('secret', 'secret'), true);
  assert.equal(authSession.verifyPlainPassword('secret', 'wrong'), false);
  assert.equal(authSession.verifyPlainPassword(null, 'x'), false);
  assert.equal(authSession.verifyPlainPassword('', ''), false);
});
