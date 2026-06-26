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
});
