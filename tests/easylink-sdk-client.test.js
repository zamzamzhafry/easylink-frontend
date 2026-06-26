import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeMachineUser } from '../lib/easylink-sdk-client.js';

describe('normalizeMachineUser', () => {
  test('returns null when pin missing/empty', () => {
    assert.equal(normalizeMachineUser({}), null);
    assert.equal(normalizeMachineUser({ pin: '' }), null);
    assert.equal(normalizeMachineUser({ pin: '   ' }), null);
    assert.equal(normalizeMachineUser(null), null);
    assert.equal(normalizeMachineUser(undefined), null);
  });

  test('extracts pin from pin or PIN key (device SDK casing varies)', () => {
    assert.equal(normalizeMachineUser({ pin: '12345' }).pin, '12345');
    assert.equal(normalizeMachineUser({ PIN: '67890' }).pin, '67890');
  });

  test('trims pin whitespace', () => {
    assert.equal(normalizeMachineUser({ pin: '  123  ' }).pin, '123');
  });

  test('name fallback chain: name > nama > Name > PIN <pin>', () => {
    assert.equal(normalizeMachineUser({ pin: '1', name: 'Alice' }).nama, 'Alice');
    assert.equal(normalizeMachineUser({ pin: '1', nama: 'Budi' }).nama, 'Budi');
    assert.equal(normalizeMachineUser({ pin: '1', Name: 'Charlie' }).nama, 'Charlie');
    assert.equal(normalizeMachineUser({ pin: '7' }).nama, 'PIN 7');
  });

  test('rfid coerced to string, empty when null/undefined', () => {
    assert.equal(normalizeMachineUser({ pin: '1', rfid: 12345 }).rfid, '12345');
    assert.equal(normalizeMachineUser({ pin: '1', rfid: null }).rfid, '');
    assert.equal(normalizeMachineUser({ pin: '1' }).rfid, '');
    assert.equal(normalizeMachineUser({ pin: '1', rfid: 'abc' }).rfid, 'abc');
  });

  test('privilege coerced via Number() w/ default 0', () => {
    assert.equal(normalizeMachineUser({ pin: '1', privilege: 14 }).privilege, 14);
    assert.equal(normalizeMachineUser({ pin: '1', Privilege: '3' }).privilege, 3);
    assert.equal(normalizeMachineUser({ pin: '1' }).privilege, 0);
  });

  test('returns null for malformed non-object input', () => {
    assert.equal(normalizeMachineUser('not-an-object'), null);
    assert.equal(normalizeMachineUser(42), null);
  });
});
