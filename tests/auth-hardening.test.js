import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  buildNormalizedAuthUser,
  decodeSessionToken,
  encodeSessionToken,
  hasPrivilegeMismatch,
  maskIdentifier,
  normalizeSubjectType,
} from '../lib/auth-hardening-helpers.js';

describe('auth hardening helpers', () => {
  test('normalizeSubjectType accepts only supported lanes', () => {
    assert.equal(normalizeSubjectType('account'), 'account');
    assert.equal(normalizeSubjectType('employee_nip'), 'employee_nip');
    assert.equal(normalizeSubjectType('legacy_pin'), 'legacy_pin');
    assert.equal(normalizeSubjectType('weird'), undefined);
    assert.equal(normalizeSubjectType(null), undefined);
  });

  test('encodeSession/decodeSession preserve typed subject lane', () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sign = (raw) =>
      crypto
        .createHmac('sha256', process.env.AUTH_SECRET || 'dev-only-insecure-fallback')
        .update(raw)
        .digest('base64url');
    const base64UrlEncode = (value) => Buffer.from(value, 'utf8').toString('base64url');
    const base64UrlDecode = (value) => Buffer.from(value, 'base64url').toString('utf8');
    const token = encodeSessionToken(
      {
        subject: 'account:HRD01',
        subject_type: 'account',
        exp,
        payload_format: 'canonical',
      },
      sign,
      base64UrlEncode
    );

    const decoded = decodeSessionToken(token, sign, base64UrlDecode, true);
    assert.deepEqual(decoded, {
      subject: 'account:HRD01',
      subject_type: 'account',
      exp,
      payload_format: 'canonical',
    });
  });

  test('decodeSession falls back legacy pin payload to legacy_pin subject type', () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const raw = Buffer.from(JSON.stringify({ pin: '1234', exp, v: 1 }), 'utf8').toString('base64url');
    const signed = `${raw}.${crypto
      .createHmac('sha256', process.env.AUTH_SECRET || 'dev-only-insecure-fallback')
      .update(raw)
      .digest('base64url')}`;
    const base64UrlDecode = (value) => Buffer.from(value, 'base64url').toString('utf8');
    const sign = (value) =>
      crypto
        .createHmac('sha256', process.env.AUTH_SECRET || 'dev-only-insecure-fallback')
        .update(value)
        .digest('base64url');
    const decoded = decodeSessionToken(signed, sign, base64UrlDecode, true);

    assert.deepEqual(decoded, {
      subject: '1234',
      subject_type: 'legacy_pin',
      exp,
      payload_format: 'legacy',
    });
  });

  test('hasPrivilegeMismatch detects disagreement across lanes', () => {
    const base = {
      pin: 'HRD01',
      nama: 'HRD01',
      privilege: 1,
      is_admin: false,
      can_schedule: true,
      can_dashboard: true,
      is_leader: false,
      groups: [],
      canonical_roles: ['employee'],
    };

    assert.equal(
      hasPrivilegeMismatch(base, {
        ...base,
        is_admin: true,
      }),
      true
    );

    assert.equal(
      hasPrivilegeMismatch(base, {
        ...base,
      }),
      false
    );
  });

  test('buildNormalizedAuthUser returns full normalized auth shape', () => {
    const auth = {
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
      subject_type: 'employee_nip',
      account_id: null,
      login_id: null,
      role_key: null,
      nip: 'HRD01',
      karyawan_id: 42,
    };

    assert.deepEqual(buildNormalizedAuthUser(auth), {
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
      subject_type: 'employee_nip',
      account_id: null,
      login_id: null,
      role_key: null,
      nip: 'HRD01',
      karyawan_id: 42,
    });
  });

  test('maskIdentifier redacts identifiers without leaking raw value', () => {
    const masked = maskIdentifier('1234567890');
    assert.ok(masked.endsWith('***'));
    assert.ok(!masked.includes('1234567890'));
  });

  test('maskIdentifier returns empty marker for blank input', () => {
    assert.equal(maskIdentifier(''), '<empty>');
    assert.equal(maskIdentifier(null), '<empty>');
    assert.equal(maskIdentifier(undefined), '<empty>');
  });
});
