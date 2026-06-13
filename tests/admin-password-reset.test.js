import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { handleAdminPasswordReset } from '@/lib/admin-password-reset.js';
import { verifyPassword } from '@/lib/password.js';
import pool from '@/lib/db.js';

const ADMIN_AUTH = { is_admin: true, karyawan_id: 10006 };
const NONADMIN_AUTH = { is_admin: false, karyawan_id: 10008 };

function poolThatMustNotBeTouched() {
  return {
    getConnection() {
      throw new Error('pool must not be used before the auth gate passes');
    },
  };
}

describe('handleAdminPasswordReset — security gate', () => {
  test('401 when unauthenticated (no auth context)', async () => {
    const res = await handleAdminPasswordReset({
      auth: null,
      body: { target_karyawan_id: 10008, new_password: 'whatever123' },
      pool: poolThatMustNotBeTouched(),
    });
    assert.equal(res.status, 401);
    assert.equal(res.json.ok, false);
  });

  test('403 with generic Forbidden when caller is not admin', async () => {
    const res = await handleAdminPasswordReset({
      auth: NONADMIN_AUTH,
      body: { target_karyawan_id: 10006, new_password: 'whatever123' },
      pool: poolThatMustNotBeTouched(),
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.error, 'Forbidden');
  });

  test('400 on bad body (short password) without touching the pool', async () => {
    const res = await handleAdminPasswordReset({
      auth: ADMIN_AUTH,
      body: { target_karyawan_id: 10008, new_password: 'short' },
      pool: poolThatMustNotBeTouched(),
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.error, 'Invalid input');
  });
});

describe('handleAdminPasswordReset — admin happy path + audit (real DB)', () => {
  const SEED_NIP = 'QA_PWRESET_T19';
  let seedKaryawanId = null;
  const seedHashPlaceholder = '$2a$12$abcdefghijklmnopqrstuv';

  before(async () => {
    const [kar] = await pool.query(
      'SELECT id FROM tb_karyawan WHERE isDeleted = 0 ORDER BY id ASC LIMIT 1'
    );
    seedKaryawanId = Number(kar[0].id);
    await pool.query('DELETE FROM tb_karyawan_auth WHERE nip = ?', [SEED_NIP]);
    await pool.query(
      'INSERT INTO tb_karyawan_auth (karyawan_id, nip, password_hash, is_active) VALUES (?, ?, ?, 1)',
      [seedKaryawanId, SEED_NIP, seedHashPlaceholder]
    );
    await pool.query('DELETE FROM tb_password_reset_audit WHERE target_karyawan_id = ?', [
      seedKaryawanId,
    ]);
  });

  after(async () => {
    if (seedKaryawanId !== null) {
      await pool.query('DELETE FROM tb_karyawan_auth WHERE nip = ?', [SEED_NIP]);
      await pool.query('DELETE FROM tb_password_reset_audit WHERE target_karyawan_id = ?', [
        seedKaryawanId,
      ]);
    }
    await pool.end();
  });

  test('200 admin reset bcrypt-hashes the new password and writes an audit row', async () => {
    const NEW_PW = 'temp-secret-9988';
    const res = await handleAdminPasswordReset({
      auth: { is_admin: true, karyawan_id: 10006 },
      body: { target_karyawan_id: seedKaryawanId, new_password: NEW_PW },
      pool,
    });

    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { ok: true });

    const [rows] = await pool.query(
      'SELECT password_hash FROM tb_karyawan_auth WHERE karyawan_id = ? AND nip = ?',
      [seedKaryawanId, SEED_NIP]
    );
    const storedHash = rows[0].password_hash;
    assert.ok(storedHash.startsWith('$2'), 'stored hash must be bcrypt');
    assert.notEqual(storedHash, NEW_PW, 'must never store plaintext');
    const { valid } = await verifyPassword(storedHash, NEW_PW);
    assert.equal(valid, true, 'new password must verify against stored bcrypt hash');

    const [audit] = await pool.query(
      'SELECT actor_karyawan_id, target_karyawan_id FROM tb_password_reset_audit WHERE target_karyawan_id = ?',
      [seedKaryawanId]
    );
    assert.equal(audit.length, 1, 'exactly one audit row');
    assert.equal(Number(audit[0].actor_karyawan_id), 10006);
    assert.equal(Number(audit[0].target_karyawan_id), seedKaryawanId);
  });

  test('400 when target auth account does not exist (no UPDATE match)', async () => {
    const res = await handleAdminPasswordReset({
      auth: { is_admin: true, karyawan_id: 10006 },
      body: { target_karyawan_id: 99999999, new_password: 'temp-secret-9988' },
      pool,
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.error, 'Target auth account not found');
  });
});
