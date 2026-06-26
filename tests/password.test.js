import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { hashPassword, verifyPassword } from '../lib/password.ts';

describe('hashPassword / verifyPassword', () => {
  test('hashes with a bcrypt prefix and rounds differ from plaintext', async () => {
    const hash = await hashPassword('hunter2');
    assert.match(hash, /^\$2[aby]\$/);
    assert.notEqual(hash, 'hunter2');
  });

  test('verifyPassword accepts correct bcrypt password', async () => {
    const hash = await hashPassword('correct horse');
    const result = await verifyPassword(hash, 'correct horse');
    assert.equal(result.valid, true);
    assert.equal(result.needsRehash, false);
  });

  test('verifyPassword rejects wrong bcrypt password', async () => {
    const hash = await hashPassword('correct horse');
    const result = await verifyPassword(hash, 'wrong');
    assert.equal(result.valid, false);
    assert.equal(result.needsRehash, false);
  });

  test('empty stored hash never authenticates (even vs empty input)', async () => {
    assert.deepEqual(await verifyPassword('', 'anything'), { valid: false, needsRehash: false });
    assert.deepEqual(await verifyPassword(null, ''), { valid: false, needsRehash: false });
    assert.deepEqual(await verifyPassword(undefined, undefined), {
      valid: false,
      needsRehash: false,
    });
  });

  test('empty input never authenticates even with real hash', async () => {
    const hash = await hashPassword('realsecret');
    const result = await verifyPassword(hash, '');
    assert.equal(result.valid, false);
  });

  test('legacy plaintext match flags needsRehash', async () => {
    const result = await verifyPassword('legacyplain', 'legacyplain');
    assert.equal(result.valid, true);
    assert.equal(result.needsRehash, true);
  });

  test('legacy plaintext mismatch rejects without rehash', async () => {
    const result = await verifyPassword('legacyplain', 'other');
    assert.equal(result.valid, false);
    assert.equal(result.needsRehash, false);
  });

  test('trims whitespace before comparing', async () => {
    const hash = await hashPassword('spaced');
    const result = await verifyPassword(hash, '  spaced  ');
    assert.equal(result.valid, true);
  });
});
