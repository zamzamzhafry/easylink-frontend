import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import pool from '../lib/db.js';
import { createAuthContextByKaryawanId } from '../lib/auth-session.ts';

const SEED_LEADER_KARYAWAN_ID = 10007;
const SEED_LEADER_NIP = 'leader001';
const SEED_LEADER_GROUP_ID = 32;
const SEED_PLACEHOLDER_KARYAWAN_ID = 9999;
const SEED_INACTIVE_KARYAWAN_ID = 10004;

let dbReachable = false;

before(async () => {
  try {
    const conn = await pool.getConnection();
    try {
      await conn.query('SELECT 1');
      dbReachable = true;
    } finally {
      conn.release();
    }
  } catch {
    dbReachable = false;
  }
});

after(async () => {
  await pool.end().catch(() => {});
});

describe('createAuthContextByKaryawanId — T8 parity (C2)', () => {
  test('leader001 (id=10007): returns leader context with grp32', async (t) => {
    if (!dbReachable) return t.skip('DB unreachable; skipping DB-backed parity test');

    const ctx = await createAuthContextByKaryawanId(SEED_LEADER_KARYAWAN_ID);

    assert.ok(ctx, 'expected non-null context for active leader');
    assert.equal(ctx.karyawan_id, SEED_LEADER_KARYAWAN_ID);
    assert.equal(ctx.nip, SEED_LEADER_NIP);
    assert.equal(ctx.subject_type, 'employee_nip');
    assert.equal(ctx.is_admin, false);
    assert.equal(ctx.is_leader, true);
    assert.ok(Array.isArray(ctx.groups));
    const scoped = ctx.groups.find((g) => Number(g.group_id) === SEED_LEADER_GROUP_ID);
    assert.ok(scoped, `expected grp${SEED_LEADER_GROUP_ID} in groups[]`);
    assert.equal(scoped.is_leader, true);
  });

  test('kar9999 (placeholder nip=9990044): returns null (blocked)', async (t) => {
    if (!dbReachable) return t.skip('DB unreachable');

    const ctx = await createAuthContextByKaryawanId(SEED_PLACEHOLDER_KARYAWAN_ID);

    assert.equal(
      ctx,
      null,
      'placeholder-NIP karyawan must be rejected by isPlaceholderEmployeeNip guard'
    );
  });

  test('kar10004 (is_active=0): returns null', async (t) => {
    if (!dbReachable) return t.skip('DB unreachable');

    const ctx = await createAuthContextByKaryawanId(SEED_INACTIVE_KARYAWAN_ID);

    assert.equal(ctx, null, 'inactive auth row must be rejected by a.is_active=1 filter');
  });

  test('non-existent karyawan_id: returns null', async (t) => {
    if (!dbReachable) return t.skip('DB unreachable');

    const ctx = await createAuthContextByKaryawanId(99999999);

    assert.equal(ctx, null);
  });
});
