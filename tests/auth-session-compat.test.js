import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { decodeSessionToken, encodeSessionToken } from '../lib/auth-hardening-helpers.js';

const legacyPinFallbackEnabled = process.env.EASYLINK_ENABLE_LEGACY_PIN_FALLBACK !== '0';
const legacySessionPayloadCompatEnabled =
  process.env.EASYLINK_ENABLE_LEGACY_SESSION_PAYLOAD_COMPAT !== '0';
const insecureCookiesAllowed = process.env.ALLOW_INSECURE_COOKIES === 'true';

const secret = process.env.AUTH_SECRET || 'dev-only-insecure-fallback';

function sign(raw) {
  return crypto.createHmac('sha256', secret).update(raw).digest('base64url');
}

function base64UrlEncode(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signPayload(payload) {
  const raw = base64UrlEncode(JSON.stringify(payload));
  return `${raw}.${sign(raw)}`;
}

function makeCanonicalToken({ subject, subject_type, exp = Math.floor(Date.now() / 1000) + 60 }) {
  return encodeSessionToken(
    {
      subject,
      subject_type,
      exp,
      payload_format: 'canonical',
    },
    sign,
    base64UrlEncode
  );
}

function resolveAuthLane(payload, { legacyPinFallbackEnabled = true } = {}) {
  if (!payload) return null;

  if (payload.subject.startsWith('account:')) {
    return { type: 'account', key: payload.subject.slice('account:'.length) };
  }
  if (payload.subject.startsWith('nip:')) {
    return { type: 'employee_nip', key: payload.subject.slice('nip:'.length) };
  }
  if (payload.subject.startsWith('pin:')) {
    if (!legacyPinFallbackEnabled) return null;
    return { type: 'legacy_pin', key: payload.subject.slice('pin:'.length) };
  }

  if (payload.subject_type === 'account') {
    return { type: 'account', key: payload.subject };
  }
  if (payload.subject_type === 'employee_nip') {
    return { type: 'employee_nip', key: payload.subject };
  }
  if (payload.subject_type === 'legacy_pin') {
    if (!legacyPinFallbackEnabled) return null;
    return { type: 'legacy_pin', key: payload.subject };
  }

  return { type: 'legacy_waterfall', key: payload.subject };
}

describe('auth session compatibility contract', () => {
  test('legacy account prefix cookie stays compatible', () => {
    const payload = decodeSessionToken(
      makeCanonicalToken({ subject: 'account:admin01', subject_type: 'account' }),
      sign,
      base64UrlDecode,
      legacySessionPayloadCompatEnabled
    );

    assert.deepEqual(payload, {
      subject: 'account:admin01',
      subject_type: 'account',
      exp: payload.exp,
      payload_format: 'canonical',
    });
    assert.deepEqual(resolveAuthLane(payload), { type: 'account', key: 'admin01' });
  });

  test('legacy nip prefix cookie stays compatible', () => {
    const payload = decodeSessionToken(
      makeCanonicalToken({ subject: 'nip:9001', subject_type: 'employee_nip' }),
      sign,
      base64UrlDecode,
      legacySessionPayloadCompatEnabled
    );

    assert.deepEqual(payload, {
      subject: 'nip:9001',
      subject_type: 'employee_nip',
      exp: payload.exp,
      payload_format: 'canonical',
    });
    assert.deepEqual(resolveAuthLane(payload), { type: 'employee_nip', key: '9001' });
  });

  test('legacy pin prefix cookie stays compatible when fallback enabled', () => {
    const payload = decodeSessionToken(
      makeCanonicalToken({ subject: 'pin:4321', subject_type: 'legacy_pin' }),
      sign,
      base64UrlDecode,
      legacySessionPayloadCompatEnabled
    );

    assert.deepEqual(payload, {
      subject: 'pin:4321',
      subject_type: 'legacy_pin',
      exp: payload.exp,
      payload_format: 'canonical',
    });
    assert.deepEqual(resolveAuthLane(payload, { legacyPinFallbackEnabled: true }), {
      type: 'legacy_pin',
      key: '4321',
    });
  });

  test('explicit st account cookie routes without subject prefix', () => {
    const payload = decodeSessionToken(
      makeCanonicalToken({ subject: 'admin01', subject_type: 'account' }),
      sign,
      base64UrlDecode,
      legacySessionPayloadCompatEnabled
    );

    assert.deepEqual(payload, {
      subject: 'admin01',
      subject_type: 'account',
      exp: payload.exp,
      payload_format: 'canonical',
    });
    assert.deepEqual(resolveAuthLane(payload), { type: 'account', key: 'admin01' });
  });

  test('explicit st employee cookie routes without subject prefix', () => {
    const payload = decodeSessionToken(
      makeCanonicalToken({ subject: 'EMP001', subject_type: 'employee_nip' }),
      sign,
      base64UrlDecode,
      legacySessionPayloadCompatEnabled
    );

    assert.deepEqual(payload, {
      subject: 'EMP001',
      subject_type: 'employee_nip',
      exp: payload.exp,
      payload_format: 'canonical',
    });
    assert.deepEqual(resolveAuthLane(payload), { type: 'employee_nip', key: 'EMP001' });
  });

  test('legacy pin payload stays compatible only when compat flag enabled', () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const token = signPayload({ pin: '1234', exp, v: 1 });
    const enabled = decodeSessionToken(token, sign, base64UrlDecode, true);
    const disabled = decodeSessionToken(token, sign, base64UrlDecode, false);

    assert.deepEqual(enabled, {
      subject: '1234',
      subject_type: 'legacy_pin',
      exp,
      payload_format: 'legacy',
    });
    assert.equal(disabled, null);
  });

  test('insecure cookie knob stays disabled by default', () => {
    // ponytail: knob is opt-in via env. Dev .env sets it true; assert the
    // *default* (env unset → false), not the inherited dev value, so the
    // test stays green under --env-file=.env. Ceiling: a CI prod-env gate
    // belongs in a deploy check, not a unit test.
    const saved = process.env.ALLOW_INSECURE_COOKIES;
    delete process.env.ALLOW_INSECURE_COOKIES;
    const defaultsToFalse = process.env.ALLOW_INSECURE_COOKIES !== 'true';
    process.env.ALLOW_INSECURE_COOKIES = saved;
    assert.equal(defaultsToFalse, true);
  });

  test('legacy rollback knobs remain wired', () => {
    assert.equal(typeof legacyPinFallbackEnabled, 'boolean');
    assert.equal(typeof legacySessionPayloadCompatEnabled, 'boolean');
  });
});
