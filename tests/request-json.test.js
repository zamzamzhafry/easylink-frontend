import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// `requestJson` calls global fetch; stub it per-test.
import { requestJson, __clearDedupCache } from '../lib/request-json.js';

const okJson = (body, init = {}) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(body),
  ...init,
});

const httpError = (status, body) => ({
  ok: false,
  status,
  text: async () => JSON.stringify(body ?? {}),
});

describe('requestJson', () => {
  let originalFetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    __clearDedupCache();
  });
  test(async function teardown() {
    global.fetch = originalFetch;
  });

  test('returns parsed JSON on success', async () => {
    global.fetch = async () => okJson({ hello: 'world' });
    const data = await requestJson('http://x');
    assert.equal(data.hello, 'world');
  });

  test('throws with error field on HTTP error', async () => {
    global.fetch = async () => httpError(500, { error: 'db down' });
    await assert.rejects(() => requestJson('http://x'), /db down/);
  });

  test('falls back to message field, then status', async () => {
    global.fetch = async () => httpError(403, { message: 'forbidden here' });
    await assert.rejects(() => requestJson('http://x'), /forbidden here/);

    global.fetch = async () => httpError(404, {});
    await assert.rejects(() => requestJson('http://x'), /404/);
  });

  test('throws on { ok: false } body even over HTTP 200', async () => {
    global.fetch = async () => okJson({ ok: false, error: 'logical fail' });
    await assert.rejects(() => requestJson('http://x'), /logical fail/);
  });

  test('returns null body parsed to null, not throw', async () => {
    global.fetch = async () => ({
      ok: true,
      status: 204,
      text: async () => '',
    });
    const data = await requestJson('http://x');
    assert.equal(data, null);
  });

  test('survives malformed JSON body on success path (parses to null)', async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      text: async () => '<<<not json>>>',
    });
    const data = await requestJson('http://x');
    assert.equal(data, null);
  });

  test('dedups concurrent identical GETs to one fetch', async () => {
    __clearDedupCache();
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return okJson({ n: calls });
    };
    const [a, b] = await Promise.all([requestJson('http://dup'), requestJson('http://dup')]);
    assert.equal(calls, 1, `expected 1 fetch, got ${calls}`);
    assert.equal(a.n, 1);
    assert.equal(b.n, 1);
  });

  test('serves cached GET within TTL without a new fetch', async () => {
    __clearDedupCache();
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return okJson({ n: calls });
    };
    const first = await requestJson('http://cache');
    const second = await requestJson('http://cache');
    assert.equal(calls, 1);
    assert.equal(first.n, 1);
    assert.equal(second.n, 1);
  });

  test('skips dedup when caller passes an AbortSignal (caller-scoped)', async () => {
    __clearDedupCache();
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return okJson({ n: calls });
    };
    const ac = new AbortController();
    await requestJson('http://sig', { signal: ac.signal });
    await requestJson('http://sig', { signal: ac.signal });
    // signal => dedupKey returns null => no cache => 2 fetches
    assert.equal(calls, 2, `expected 2 fetches with signal, got ${calls}`);
  });

  test('does not dedup non-GET methods', async () => {
    __clearDedupCache();
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return okJson({ n: calls });
    };
    await requestJson('http://post', { method: 'POST' });
    await requestJson('http://post', { method: 'POST' });
    assert.equal(calls, 2);
  });
});
