import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { buildNormalizedAuthUser } from '../lib/auth-hardening-helpers.js';

describe('normalized auth response contract', () => {
  test('returns exact normalized account auth user shape', () => {
    const accountAuth = {
      pin: 'A-100',
      nama: 'Admin One',
      privilege: 4,
      is_admin: true,
      is_hr: 0,
      is_leader: true,
      can_schedule: true,
      can_dashboard: true,
      groups: [],
      canonical_roles: ['admin'],
      subject_type: 'account',
      account_id: 99,
      login_id: 'admin01',
      role_key: 'admin',
      nip: undefined,
      karyawan_id: undefined,
      password_hash: 'secret',
      session_token: 'sensitive-token',
      created_at: '2026-01-01 00:00:00',
    };

    const normalized = buildNormalizedAuthUser(accountAuth);

    assert.deepEqual(Object.keys(normalized), [
      'pin',
      'nama',
      'privilege',
      'is_admin',
      'is_hr',
      'is_leader',
      'can_schedule',
      'can_dashboard',
      'groups',
      'canonical_roles',
      'subject_type',
      'account_id',
      'login_id',
      'role_key',
      'nip',
      'karyawan_id',
    ]);
    assert.deepEqual(normalized, {
      pin: 'A-100',
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
      account_id: 99,
      login_id: 'admin01',
      role_key: 'admin',
      nip: null,
      karyawan_id: null,
    });

    assert.equal(Object.hasOwn(normalized, 'password_hash'), false);
    assert.equal(Object.hasOwn(normalized, 'session_token'), false);
    assert.equal(Object.hasOwn(normalized, 'created_at'), false);
  });

  test('returns exact normalized employee auth user shape with null defaults', () => {
    const employeeAuth = {
      pin: 'HRD01',
      nama: 'Human Resource',
      privilege: 3,
      is_admin: false,
      is_hr: 1,
      is_leader: false,
      can_schedule: true,
      can_dashboard: true,
      groups: [{ group_id: 7, nama_group: 'Ops', can_schedule: true, can_dashboard: true, is_leader: false }],
      canonical_roles: ['group_leader', 'employee'],
      subject_type: '',
      account_id: 0,
      login_id: '',
      role_key: undefined,
      nip: 'HRD01',
      karyawan_id: 42,
      password_hash: 'secret',
      auth_cookie: 'sensitive-cookie',
      employee_number: 'E-42',
    };

    const normalized = buildNormalizedAuthUser(employeeAuth);

    assert.deepEqual(Object.keys(normalized), [
      'pin',
      'nama',
      'privilege',
      'is_admin',
      'is_hr',
      'is_leader',
      'can_schedule',
      'can_dashboard',
      'groups',
      'canonical_roles',
      'subject_type',
      'account_id',
      'login_id',
      'role_key',
      'nip',
      'karyawan_id',
    ]);
    assert.deepEqual(normalized, {
      pin: 'HRD01',
      nama: 'Human Resource',
      privilege: 3,
      is_admin: false,
      is_hr: true,
      is_leader: false,
      can_schedule: true,
      can_dashboard: true,
      groups: [{ group_id: 7, nama_group: 'Ops', can_schedule: true, can_dashboard: true, is_leader: false }],
      canonical_roles: ['group_leader', 'employee'],
      subject_type: null,
      account_id: null,
      login_id: null,
      role_key: null,
      nip: 'HRD01',
      karyawan_id: 42,
    });

    assert.equal(Object.hasOwn(normalized, 'password_hash'), false);
    assert.equal(Object.hasOwn(normalized, 'auth_cookie'), false);
    assert.equal(Object.hasOwn(normalized, 'employee_number'), false);
  });
});
