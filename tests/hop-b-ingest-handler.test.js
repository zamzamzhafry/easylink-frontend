import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { handleHopBIngestPost, buildValidHopBBatch } from '../lib/hop-b-ingest-handler.js';

const TOKEN = 'test-secret-token-abcdef';
const originalToken = process.env.HOP_B_AUTH_TOKEN;

function makeRequest({ headers = {}, body } = {}) {
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
  };
  if (body === undefined) {
    init.body = JSON.stringify(buildValidHopBBatch());
  } else if (typeof body === 'string') {
    init.body = body;
  } else {
    init.body = JSON.stringify(body);
  }
  return new Request('http://localhost/api/scanlog/ingest', init);
}

async function bodyOf(response) {
  return response.json();
}

describe('hop-b-ingest-handler auth boundary', () => {
  before(() => {
    process.env.HOP_B_AUTH_TOKEN = TOKEN;
  });
  after(() => {
    if (originalToken === undefined) delete process.env.HOP_B_AUTH_TOKEN;
    else process.env.HOP_B_AUTH_TOKEN = originalToken;
  });

  test('rejects when HOP_B_AUTH_TOKEN not configured (500)', async () => {
    delete process.env.HOP_B_AUTH_TOKEN;
    const res = await handleHopBIngestPost(makeRequest());
    const data = await bodyOf(res);
    assert.equal(res.status, 500);
    assert.equal(data.code, 'AUTH_NOT_CONFIGURED');
    process.env.HOP_B_AUTH_TOKEN = TOKEN;
  });

  test('rejects missing Authorization header (401)', async () => {
    const res = await handleHopBIngestPost(makeRequest({ headers: { authorization: '' } }));
    const data = await bodyOf(res);
    assert.equal(res.status, 401);
    assert.equal(data.code, 'AUTH_MISSING');
  });

  test('rejects malformed Bearer scheme (401)', async () => {
    const res = await handleHopBIngestPost(
      makeRequest({ headers: { authorization: 'Basic abc' } })
    );
    const data = await bodyOf(res);
    assert.equal(res.status, 401);
    assert.equal(data.code, 'AUTH_MISSING');
  });

  test('rejects wrong token (401) — timing-safe compare', async () => {
    const res = await handleHopBIngestPost(
      makeRequest({ headers: { authorization: 'Bearer wrong-token-value' } })
    );
    const data = await bodyOf(res);
    assert.equal(res.status, 401);
    assert.equal(data.code, 'AUTH_INVALID');
  });

  test('rejects token of wrong length (401) — no throw, no leak', async () => {
    // safeTokenEquals must return false (not throw) on length mismatch
    const res = await handleHopBIngestPost(
      makeRequest({ headers: { authorization: 'Bearer short' } })
    );
    const data = await bodyOf(res);
    assert.equal(res.status, 401);
    assert.equal(data.code, 'AUTH_INVALID');
  });

  test('accepts correct token — passes auth to body parsing', async () => {
    // Valid token but malformed body → should get past auth (no AUTH_* code)
    const res = await handleHopBIngestPost(
      makeRequest({ headers: { authorization: `Bearer ${TOKEN}` }, body: 'not json' })
    );
    const data = await bodyOf(res);
    assert.notEqual(data.code, 'AUTH_MISSING');
    assert.notEqual(data.code, 'AUTH_INVALID');
    assert.notEqual(data.code, 'AUTH_NOT_CONFIGURED');
    // Should be a body-parse / validation error, not auth
  });
});
