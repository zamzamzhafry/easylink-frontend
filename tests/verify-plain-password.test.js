import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { verifyPlainPassword } from '../lib/auth-session.ts';

describe('verifyPlainPassword', () => {
  test('rejects empty submitted password when stored password exists', () => {
    assert.equal(verifyPlainPassword('password123', ''), false);
    assert.equal(verifyPlainPassword(' password123 ', '  '), false);
  });

  test('rejects non-empty submitted password when stored password is empty', () => {
    assert.equal(verifyPlainPassword('', 'password123'), false);
    assert.equal(verifyPlainPassword('   ', 'password123'), false);
    assert.equal(verifyPlainPassword(null, 'password123'), false);
    assert.equal(verifyPlainPassword(undefined, 'password123'), false);
  });

  test('rejects empty submitted password when stored password is also empty', () => {
    assert.equal(verifyPlainPassword('', ''), false);
    assert.equal(verifyPlainPassword('   ', '  '), false);
    assert.equal(verifyPlainPassword(null, ''), false);
    assert.equal(verifyPlainPassword(undefined, '   '), false);
  });

  test('accepts matching values after trimming', () => {
    assert.equal(verifyPlainPassword('  secret  ', 'secret'), true);
    assert.equal(verifyPlainPassword('secret', '  secret  '), true);
  });

  test('rejects mismatched values without leaking timing path', () => {
    assert.equal(verifyPlainPassword('secret', 'Secret'), false);
    assert.equal(verifyPlainPassword('abc', 'ab'), false);
  });
});
