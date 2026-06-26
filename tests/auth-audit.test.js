import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { recordRoleChange, recordPasswordReset } from '../lib/auth-audit.ts';

// Mock executor — captures the query + params so tests can assert what gets written.
function mockExecutor(returnInsertId = 1) {
  const calls = [];
  const exec = {
    async query(sql, params) {
      calls.push({ sql, params });
      return [{ insertId: returnInsertId, affectedRows: 1 }];
    },
  };
  return { exec, calls };
}

describe('recordRoleChange input validation', () => {
  test('rejects non-integer targetKaryawanId', async () => {
    const { exec } = mockExecutor();
    await assert.rejects(
      () => recordRoleChange({ actorKaryawanId: 1, targetKaryawanId: 1.5, action: 'grant', roleKey: 'admin' }, exec),
      /targetKaryawanId must be a positive integer/
    );
  });

  test('rejects zero / negative targetKaryawanId', async () => {
    const { exec } = mockExecutor();
    await assert.rejects(
      () => recordRoleChange({ actorKaryawanId: 1, targetKaryawanId: 0, action: 'grant', roleKey: 'admin' }, exec),
      /positive integer/
    );
  });

  test('rejects invalid action', async () => {
    const { exec } = mockExecutor();
    await assert.rejects(
      () => recordRoleChange({ actorKaryawanId: 1, targetKaryawanId: 5, action: 'delete', roleKey: 'admin' }, exec),
      /invalid action/
    );
  });

  test('rejects empty roleKey', async () => {
    const { exec } = mockExecutor();
    await assert.rejects(
      () => recordRoleChange({ actorKaryawanId: 1, targetKaryawanId: 5, action: 'grant', roleKey: '' }, exec),
      /non-empty string/
    );
  });

  test('coerces non-integer actor → null (system/unknown actor)', async () => {
    const { exec, calls } = mockExecutor();
    await recordRoleChange({ actorKaryawanId: undefined, targetKaryawanId: 5, action: 'grant', roleKey: 'admin' }, exec);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].params[0], null, 'actor should be null');
    assert.equal(calls[0].params[1], 5);
  });

  test('coerces non-integer groupId → null', async () => {
    const { exec, calls } = mockExecutor();
    await recordRoleChange({ actorKaryawanId: 1, targetKaryawanId: 5, action: 'revoke', roleKey: 'group_leader', groupId: 'not-a-number' }, exec);
    assert.equal(calls[0].params[4], null, 'group should be null');
  });

  test('writes parameterized INSERT + returns insertId', async () => {
    const { exec, calls } = mockExecutor(42);
    const id = await recordRoleChange({ actorKaryawanId: 1, targetKaryawanId: 5, action: 'grant', roleKey: 'group_leader', groupId: 32 }, exec);
    assert.equal(id, 42);
    assert.match(calls[0].sql, /INSERT INTO tb_role_change_audit/);
    assert.deepEqual(calls[0].params, [1, 5, 'grant', 'group_leader', 32]);
  });
});

describe('recordPasswordReset input validation', () => {
  test('rejects non-integer target', async () => {
    const { exec } = mockExecutor();
    await assert.rejects(
      () => recordPasswordReset({ actorKaryawanId: 1, targetKaryawanId: 'x' }, exec),
      /positive integer/
    );
  });

  test('coerces undefined actor → null', async () => {
    const { exec, calls } = mockExecutor();
    await recordPasswordReset({ actorKaryawanId: undefined, targetKaryawanId: 5 }, exec);
    assert.equal(calls[0].params[0], null);
    assert.equal(calls[0].params[1], 5);
  });

  test('writes parameterized INSERT (no password material)', async () => {
    const { exec, calls } = mockExecutor(7);
    const id = await recordPasswordReset({ actorKaryawanId: 10, targetKaryawanId: 20 }, exec);
    assert.equal(id, 7);
    assert.match(calls[0].sql, /INSERT INTO tb_password_reset_audit/);
    // Exactly 2 params — actor + target only. No password column.
    assert.equal(calls[0].params.length, 2);
    assert.deepEqual(calls[0].params, [10, 20]);
  });
});
