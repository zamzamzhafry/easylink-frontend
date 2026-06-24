import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeNextPath } from '../lib/login-redirect.js';

describe('login redirect sanitizer', () => {
  test('returns / for empty or missing input', () => {
    assert.equal(sanitizeNextPath(undefined), '/');
    assert.equal(sanitizeNextPath(null), '/');
    assert.equal(sanitizeNextPath(''), '/');
    assert.equal(sanitizeNextPath('   '), '/');
  });

  test('returns / for protocol-relative or absolute URLs', () => {
    assert.equal(sanitizeNextPath('//evil.com'), '/');
    assert.equal(sanitizeNextPath('https://evil.com/dashboard'), '/');
    assert.equal(sanitizeNextPath('http://evil.com'), '/');
  });

  test('returns / for paths that do not start with /', () => {
    assert.equal(sanitizeNextPath('dashboard'), '/');
    assert.equal(sanitizeNextPath('\\admin'), '/');
  });

  test('returns / for /login targets', () => {
    assert.equal(sanitizeNextPath('/login'), '/');
    assert.equal(sanitizeNextPath('/login?next=/scanlog'), '/');
    assert.equal(sanitizeNextPath('/login#top'), '/');
  });

  test('preserves safe same-app paths', () => {
    assert.equal(sanitizeNextPath('/scanlog?from=2026-05-01'), '/scanlog?from=2026-05-01');
    assert.equal(sanitizeNextPath('/dashboard#section'), '/dashboard#section');
    assert.equal(sanitizeNextPath('/scanlog'), '/scanlog');
  });
});
