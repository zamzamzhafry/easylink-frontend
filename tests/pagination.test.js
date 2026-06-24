import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parsePaginationParams,
  computePaginationMeta,
  resolveItemsFromPayload,
  buildPaginatedResponse,
} from '../lib/pagination.js';

const params = (obj) => ({ get: (k) => obj[k] });

describe('parsePaginationParams', () => {
  test('clamps limit to maxLimit', () => {
    const { limit } = parsePaginationParams(params({ limit: '99999' }), { maxLimit: 100 });
    assert.equal(limit, 100);
  });

  test('falls back to defaultLimit on garbage/missing', () => {
    assert.equal(parsePaginationParams(params({})).limit, 20);
    assert.equal(parsePaginationParams(params({ limit: 'abc' })).limit, 20);
    assert.equal(parsePaginationParams(params({ limit: '-5' })).limit, 20);
    assert.equal(parsePaginationParams(params({ limit: '0' })).limit, 20);
  });

  test('pageInput floor at 1, never negative', () => {
    assert.equal(parsePaginationParams(params({ page: '-3' })).pageInput, 1);
    assert.equal(parsePaginationParams(params({ page: '0' })).pageInput, 1);
    assert.equal(parsePaginationParams(params({ page: '7' })).pageInput, 7);
  });

  test('null/undefined searchParams does not throw', () => {
    const { limit } = parsePaginationParams(null);
    assert.equal(limit, 20);
  });
});

describe('computePaginationMeta', () => {
  test('offset is zero-based multiple of limit', () => {
    const meta = computePaginationMeta({ total: 55, pageInput: 3, limit: 10 });
    assert.equal(meta.offset, 20);
    assert.equal(meta.pages, 6);
    assert.equal(meta.page, 3);
  });

  test('page clamps to last page when out of range', () => {
    const meta = computePaginationMeta({ total: 5, pageInput: 999, limit: 10 });
    assert.equal(meta.page, 1);
  });

  test('zero total yields exactly one page', () => {
    const meta = computePaginationMeta({ total: 0, pageInput: 5, limit: 20 });
    assert.equal(meta.pages, 1);
    assert.equal(meta.page, 1);
    assert.equal(meta.offset, 0);
  });

  test('non-numeric total coerced to 0', () => {
    const meta = computePaginationMeta({ total: NaN, pageInput: 1, limit: 10 });
    assert.equal(meta.total, 0);
  });
});

describe('resolveItemsFromPayload', () => {
  test('bare array passes through', () => {
    assert.deepEqual(resolveItemsFromPayload([1, 2, 3]), [1, 2, 3]);
  });

  test('extracts from known item keys in priority order', () => {
    assert.deepEqual(resolveItemsFromPayload({ items: ['a'] }), ['a']);
    assert.deepEqual(resolveItemsFromPayload({ records: ['b'] }), ['b']);
    assert.deepEqual(resolveItemsFromPayload({ foo: ['c'] }, ['foo']), ['c']);
  });

  test('unknown shape yields empty array, not undefined', () => {
    assert.deepEqual(resolveItemsFromPayload({ unrelated: 1 }), []);
    assert.deepEqual(resolveItemsFromPayload(null), []);
  });
});

describe('buildPaginatedResponse', () => {
  test('shapes payload with meta + items', () => {
    const res = buildPaginatedResponse({ items: ['x', 'y'], total: 25, pageInput: 2, limit: 10 });
    assert.equal(res.ok, true);
    assert.deepEqual(res.items, ['x', 'y']);
    assert.equal(res.total, 25);
    assert.equal(res.page, 2);
    assert.equal(res.pages, 3);
  });

  test('non-array items normalized to []', () => {
    const res = buildPaginatedResponse({ items: null, total: 0, pageInput: 1, limit: 10 });
    assert.deepEqual(res.items, []);
  });

  test('itemKey alias duplicates items under custom key', () => {
    const res = buildPaginatedResponse({
      items: [1],
      total: 1,
      pageInput: 1,
      limit: 10,
      itemKey: 'users',
    });
    assert.deepEqual(res.users, [1]);
  });
});
