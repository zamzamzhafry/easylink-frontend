import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { csvEscape } from '../lib/csv.js';

describe('csvEscape', () => {
  test('wraps value in quotes', () => {
    assert.equal(csvEscape('hello'), '"hello"');
    assert.equal(csvEscape(123), '"123"');
  });

  test('handles null/undefined/empty', () => {
    assert.equal(csvEscape(null), '""');
    assert.equal(csvEscape(undefined), '""');
    assert.equal(csvEscape(''), '""');
  });

  test('escapes embedded double quotes (RFC 4180)', () => {
    assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  });

  test('preserves commas (no extra escaping needed — quoting handles it)', () => {
    assert.equal(csvEscape('a,b,c'), '"a,b,c"');
  });

  test('guards formula injection — prefixes = + - @ with single quote', () => {
    assert.equal(csvEscape('=SUM(A1:A2)'), `"'=SUM(A1:A2)"`);
    assert.equal(csvEscape('+1+1'), `"'+1+1"`);
    assert.equal(csvEscape('-1'), `"'-1"`);
    assert.equal(csvEscape('@cmd'), `"'@cmd"`);
  });

  test('does not prefix non-formula leading chars', () => {
    assert.equal(csvEscape('hello'), '"hello"');
    assert.equal(csvEscape('normal text'), '"normal text"');
    // Negative number NOT at start is fine; leading '-' is the injection vector.
    assert.equal(csvEscape('value -5'), '"value -5"');
  });

  test('combined: formula char + embedded quote', () => {
    // = prefix → leading ' guard, then BOTH embedded quotes doubled.
    assert.equal(csvEscape('="bad"'), `"'=""bad"""`);
  });

  test('coerces non-strings to string', () => {
    assert.equal(csvEscape(0), '"0"');
    assert.equal(csvEscape(false), '"false"');
  });
});
