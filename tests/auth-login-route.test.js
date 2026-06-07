import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { resolveAuthenticatedLane } from '../lib/auth-login-helpers.js';

const originalWarn = console.warn;
let warnCalls = [];

beforeEach(() => {
  warnCalls = [];
  console.warn = (...args) => {
    warnCalls.push(args);
  };
});

afterEach(() => {
  console.warn = originalWarn;
});

describe('auth login lane resolver', () => {
  const accountContext = {
    pin: 'admin01',
    nama: 'Admin One',
    privilege: 4,
    is_admin: true,
    is_hr: false,
    is_leader: true,
    can_schedule: true,
    can_dashboard: true,
    groups: [],
    canonical_roles: ['admin'],
    subject_type: 'account',
    account_id: 1,
    login_id: 'admin01',
    role_key: 'admin',
    nip: null,
    karyawan_id: null,
  };

  const matchingNipContext = {
    pin: '1234',
    nama: 'Admin One',
    privilege: 4,
    is_admin: true,
    is_hr: false,
    is_leader: true,
    can_schedule: true,
    can_dashboard: true,
    groups: [],
    canonical_roles: ['admin'],
    subject_type: 'employee_nip',
    account_id: null,
    login_id: null,
    role_key: null,
    nip: 'admin01',
    karyawan_id: 10,
  };

  test('keeps account lane when active auth account exists and privileges match', async () => {
    const result = await resolveAuthenticatedLane({
      loginId: 'admin01',
      accountContext,
      nipContext: matchingNipContext,
      selectedSubjectType: 'account',
    });

    assert.deepEqual(result, {
      ok: true,
      authContext: accountContext,
      subjectType: 'account',
    });
  });

  test('returns collision conflict only when proven after both contexts exist', async () => {
    const result = await resolveAuthenticatedLane({
      loginId: 'shared01',
      accountContext,
      nipContext: {
        ...matchingNipContext,
        is_admin: false,
        is_leader: false,
        can_schedule: false,
        can_dashboard: false,
      },
      selectedSubjectType: 'account',
    });

    assert.deepEqual(result, {
      ok: false,
      status: 409,
      error: 'Auth identity conflict.',
    });
    assert.deepEqual(warnCalls, [[
      'AUTH_IDENTITY_COLLISION',
      {
        code: 'AUTH_IDENTITY_COLLISION',
        login_id: 'shared01',
        selected_subject_type: 'account',
        alternate_subject_type: 'employee_nip',
      },
    ]]);
  });

  test('keeps employee lane when no active auth account selected it and no mismatch exists', async () => {
    const result = await resolveAuthenticatedLane({
      loginId: 'NIP-01',
      accountContext: null,
      nipContext: matchingNipContext,
      selectedSubjectType: 'employee_nip',
    });
 
    assert.deepEqual(result, {
      ok: true,
      authContext: matchingNipContext,
      subjectType: 'employee_nip',
    });
  });

  test('returns collision conflict when employee lane selected and account privileges mismatch', async () => {
    const result = await resolveAuthenticatedLane({
      loginId: 'shared01',
      accountContext: {
        ...accountContext,
        can_dashboard: false,
      },
      nipContext: matchingNipContext,
      selectedSubjectType: 'employee_nip',
    });

    assert.deepEqual(result, {
      ok: false,
      status: 409,
      error: 'Auth identity conflict.',
    });
    assert.deepEqual(warnCalls, [[
      'AUTH_IDENTITY_COLLISION',
      {
        code: 'AUTH_IDENTITY_COLLISION',
        login_id: 'shared01',
        selected_subject_type: 'employee_nip',
        alternate_subject_type: 'account',
      },
    ]]);
  });

  test('fails closed on unsupported selected lane', async () => {
    const result = await resolveAuthenticatedLane({
      loginId: 'broken01',
      accountContext,
      nipContext: matchingNipContext,
      selectedSubjectType: 'legacy_pin',
    });

    assert.deepEqual(result, {
      ok: false,
      status: 500,
      error: 'Failed to resolve authenticated lane',
    });
    assert.deepEqual(warnCalls, []);
  });
});

