import assert from 'node:assert/strict';
import test from 'node:test';

process.env.HOP_B_AUTH_TOKEN = 'test-hop-b-token';

const { buildValidHopBBatch, handleHopBIngestPost } = await import('../lib/hop-b-ingest-handler.js');
const { computeHopBPayloadHash } = await import('../lib/hop-b-ingest-contract.js');
const {
  buildHopBCanonicalPayload,
  insertHopBSafeEvents,
  writeHopBCanonicalBatch,
} = await import('../lib/hop-b-ingest-writer.js');
const {
  buildScanlogReadBoundary,
  resolveScanlogReadSource,
} = await import('../lib/scanlog-read-source.js');
const pool = (await import('../lib/db.js')).default;

function buildRequest(body, headers = {}) {
  return new Request('http://localhost/api/scanlog/ingest', {
    method: 'POST',
    headers,
    body,
  });
}

async function readJson(response) {
  return response.json();
}

test('ingest accepts authorized valid batch and returns deterministic ack', async () => {
  const payload = buildValidHopBBatch();
  const expectedHash = computeHopBPayloadHash(payload);
  const receiptCalls = [];
  const writeCalls = [];

  const response = await handleHopBIngestPost(
    buildRequest(JSON.stringify(payload), {
      'content-type': 'application/json',
      authorization: 'Bearer test-hop-b-token',
      'x-request-id': 'req-valid-001',
    }),
    {
      async recordHopBReceipt(input) {
        receiptCalls.push(input);
        return {
          ok: true,
          replay: false,
          logId: 77,
          batchId: input.batchId,
          recordCount: input.recordCount,
          insertedCount: 0,
          duplicateCount: 0,
          status: 'received',
          receivedAt: '2026-05-29T12:00:01Z',
          committedAt: null,
        };
      },
      async writeHopBCanonicalBatch(input) {
        writeCalls.push(input);
        return {
          ok: true,
          replay: false,
          logId: input.ingestLogId,
          batchId: payload.batch_id,
          recordCount: payload.record_count,
          insertedCount: 1,
          duplicateCount: 0,
          status: 'committed',
          receivedAt: '2026-05-29T12:00:01Z',
          committedAt: '2026-05-29T12:00:02Z',
        };
      },
    }
  );

  assert.equal(response.status, 200);
  const json = await readJson(response);

  assert.deepEqual(receiptCalls, [
    {
      batchId: payload.batch_id,
      sourceSdk: payload.source_sdk,
      deviceSn: payload.device_sn,
      recordCount: payload.record_count,
      payloadHash: expectedHash,
    },
  ]);
  assert.equal(writeCalls.length, 1);
  assert.equal(writeCalls[0].ingestLogId, 77);
  assert.equal(writeCalls[0].sourceBatchId, payload.batch_id);
  assert.equal(writeCalls[0].records[0].source_sdk, payload.source_sdk);
  assert.equal(json.status, 'ok');
  assert.equal(json.code, 'BATCH_ACCEPTED');
  assert.equal(json.message, 'Batch committed');
  assert.equal(json.request_id, 'req-valid-001');
  assert.deepEqual(json.ack, {
    batch_id: payload.batch_id,
    record_count: payload.record_count,
    inserted_count: 1,
    duplicate_count: 0,
    replay: false,
    received_at: '2026-05-29T12:00:01Z',
    committed_at: '2026-05-29T12:00:02Z',
  });
});

test('ingest returns replay ack when same batch already committed', async () => {
  const payload = buildValidHopBBatch({ batch_id: '00000000-0000-4000-8000-000000000099' });
  let writeCalled = false;

  const response = await handleHopBIngestPost(
    buildRequest(JSON.stringify(payload), {
      'content-type': 'application/json',
      authorization: 'Bearer test-hop-b-token',
      'x-request-id': 'req-replay-001',
    }),
    {
      async recordHopBReceipt() {
        return {
          ok: true,
          replay: true,
          logId: 88,
          batchId: payload.batch_id,
          recordCount: payload.record_count,
          insertedCount: 0,
          duplicateCount: 1,
          status: 'committed',
          receivedAt: '2026-05-29T12:00:01Z',
          committedAt: '2026-05-29T12:00:02Z',
        };
      },
      async writeHopBCanonicalBatch() {
        writeCalled = true;
        throw new Error('should not write on replay');
      },
    }
  );

  assert.equal(response.status, 200);
  const json = await readJson(response);
  assert.equal(writeCalled, false);
  assert.equal(json.code, 'BATCH_REPLAYED');
  assert.equal(json.ack.replay, true);
  assert.equal(json.ack.duplicate_count, 1);
});

test('ingest rejects missing auth with deterministic envelope', async () => {
  const response = await handleHopBIngestPost(
    buildRequest(JSON.stringify(buildValidHopBBatch()), {
      'content-type': 'application/json',
      'x-request-id': 'req-auth-missing',
    })
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await readJson(response), {
    status: 'error',
    code: 'AUTH_MISSING',
    message: 'Authorization header required',
    request_id: 'req-auth-missing',
  });
});

test('ingest rejects invalid bearer token with deterministic envelope', async () => {
  const response = await handleHopBIngestPost(
    buildRequest(JSON.stringify(buildValidHopBBatch()), {
      'content-type': 'application/json',
      authorization: 'Bearer wrong-token',
      'x-request-id': 'req-auth-invalid',
    })
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await readJson(response), {
    status: 'error',
    code: 'AUTH_INVALID',
    message: 'Bearer token invalid',
    request_id: 'req-auth-invalid',
  });
});

test('canonical payload keeps source batch and ingest trace', () => {
  const payload = buildValidHopBBatch();
  const canonical = buildHopBCanonicalPayload(
    {
      ...payload.records[0],
      source_sdk: payload.source_sdk,
      source_batch_id: payload.batch_id,
    },
    701
  );

  assert.equal(canonical.source_event_key, payload.records[0].source_event_key);
  assert.deepEqual(canonical._trace, {
    hop_b_ingest_log_id: 701,
    source_batch_id: payload.batch_id,
    source_device_sn: payload.records[0].device_sn,
    source_event_key: payload.records[0].source_event_key,
  });
});

test('scanlog read source defaults to canonical linux records for direct cutover', async () => {
  const sourceState = resolveScanlogReadSource(undefined, {
    hasSafeTable: true,
    hasLegacyTable: true,
  });

  assert.deepEqual(sourceState, {
    requestedSource: 'canonical',
    resolvedSource: 'canonical',
    baseTable: 'tb_scanlog_safe_events',
    useCanonical: true,
    fallbackReason: null,
  });

  assert.deepEqual(buildScanlogReadBoundary(sourceState), {
    direct_cutover_source: 'canonical',
    resolved_source: 'canonical',
    requested_source: 'canonical',
    fallback_reason: null,
    legacy_sdk_pull_route: '/api/scanlog/sync',
    legacy_sdk_pull_allowed: false,
  });
});

test('scanlog read source keeps legacy boundary explicit when requested', async () => {
  const sourceState = resolveScanlogReadSource('legacy', {
    hasSafeTable: true,
    hasLegacyTable: true,
  });

  assert.deepEqual(sourceState, {
    requestedSource: 'legacy',
    resolvedSource: 'legacy',
    baseTable: 'tb_scanlog',
    useCanonical: false,
    fallbackReason: null,
  });

  assert.deepEqual(buildScanlogReadBoundary(sourceState), {
    direct_cutover_source: 'canonical',
    resolved_source: 'legacy',
    requested_source: 'legacy',
    fallback_reason: null,
    legacy_sdk_pull_route: '/api/scanlog/sync',
    legacy_sdk_pull_allowed: true,
  });
});

test('writer inserts canonical events with trace and finalizes duplicate-safe receipt', async () => {
  const payload = buildValidHopBBatch({
    batch_id: '00000000-0000-4000-8000-000000000555',
  });
  const calls = [];
  const connection = {
    async query(sql, params) {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalizedSql, params });
      if (normalizedSql.startsWith('INSERT IGNORE INTO tb_scanlog_safe_events')) {
        return [{ affectedRows: 1 }];
      }
      if (normalizedSql.startsWith('UPDATE tb_hop_b_ingest_log')) {
        return [{ affectedRows: 1 }];
      }
      if (normalizedSql.startsWith('SELECT id, batch_id, record_count')) {
        return [[{
          id: 701,
          batch_id: payload.batch_id,
          record_count: payload.record_count,
          inserted_count: 1,
          duplicate_count: 0,
          status: 'committed',
          received_at: '2026-05-29T12:00:01Z',
          committed_at: '2026-05-29T12:00:02Z',
        }]];
      }
      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
    async beginTransaction() {
      calls.push({ sql: 'BEGIN', params: [] });
    },
    async commit() {
      calls.push({ sql: 'COMMIT', params: [] });
    },
    async rollback() {
      calls.push({ sql: 'ROLLBACK', params: [] });
    },
    release() {
      calls.push({ sql: 'RELEASE', params: [] });
    },
  };

  const originalGetConnection = pool.getConnection.bind(pool);
  pool.getConnection = async () => connection;

  try {
    const result = await writeHopBCanonicalBatch({
      ingestLogId: 701,
      sourceBatchId: payload.batch_id,
      records: payload.records.map((record) => ({
        ...record,
        source_sdk: payload.source_sdk,
      })),
    });

    assert.equal(result.insertedCount, 1);
    assert.equal(result.duplicateCount, 0);
    const insertCall = calls.find((entry) => entry.sql.startsWith('INSERT IGNORE INTO tb_scanlog_safe_events'));
    const rawPayload = JSON.parse(insertCall.params[10]);
    assert.deepEqual(rawPayload._trace, {
      hop_b_ingest_log_id: 701,
      source_batch_id: payload.batch_id,
      source_device_sn: payload.records[0].device_sn,
      source_event_key: payload.records[0].source_event_key,
    });

    const updateCall = calls.find((entry) => entry.sql.startsWith('UPDATE tb_hop_b_ingest_log'));
    assert.deepEqual(updateCall.params, [1, 0, null, 701]);
  } finally {
    pool.getConnection = originalGetConnection;
  }
});

test('writer duplicate replay path keeps canonical row count flat', async () => {
  const payload = buildValidHopBBatch({
    batch_id: '00000000-0000-4000-8000-000000000556',
  });
  const calls = [];
  const connection = {
    async query(sql, params) {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalizedSql, params });
      if (normalizedSql.startsWith('INSERT IGNORE INTO tb_scanlog_safe_events')) {
        return [{ affectedRows: 0 }];
      }
      if (normalizedSql.startsWith('UPDATE tb_hop_b_ingest_log')) {
        return [{ affectedRows: 1 }];
      }
      if (normalizedSql.startsWith('SELECT id, batch_id, record_count')) {
        return [[{
          id: 702,
          batch_id: payload.batch_id,
          record_count: payload.record_count,
          inserted_count: 0,
          duplicate_count: 1,
          status: 'committed',
          received_at: '2026-05-29T12:10:01Z',
          committed_at: '2026-05-29T12:10:02Z',
        }]];
      }
      throw new Error(`Unexpected SQL: ${normalizedSql}`);
    },
    async beginTransaction() {
      calls.push({ sql: 'BEGIN', params: [] });
    },
    async commit() {
      calls.push({ sql: 'COMMIT', params: [] });
    },
    async rollback() {
      calls.push({ sql: 'ROLLBACK', params: [] });
    },
    release() {
      calls.push({ sql: 'RELEASE', params: [] });
    },
  };

  const originalGetConnection = pool.getConnection.bind(pool);
  pool.getConnection = async () => connection;

  try {
    const result = await writeHopBCanonicalBatch({
      ingestLogId: 702,
      sourceBatchId: payload.batch_id,
      records: payload.records.map((record) => ({
        ...record,
        source_sdk: payload.source_sdk,
      })),
    });

    assert.equal(result.insertedCount, 0);
    assert.equal(result.duplicateCount, 1);
    const updateCall = calls.find((entry) => entry.sql.startsWith('UPDATE tb_hop_b_ingest_log'));
    assert.deepEqual(updateCall.params, [0, 1, null, 702]);
  } finally {
    pool.getConnection = originalGetConnection;
  }
});

test('ingest rejects non-json content type with deterministic envelope', async () => {
  const response = await handleHopBIngestPost(
    buildRequest('batch=bad', {
      'content-type': 'text/plain',
      authorization: 'Bearer test-hop-b-token',
      'x-request-id': 'req-content-type',
    })
  );

  assert.equal(response.status, 415);
  assert.deepEqual(await readJson(response), {
    status: 'error',
    code: 'CONTENT_TYPE_INVALID',
    message: 'Content-Type must be application/json',
    request_id: 'req-content-type',
  });
});

test('ingest rejects malformed json with deterministic envelope', async () => {
  const response = await handleHopBIngestPost(
    buildRequest('{"schema_version":', {
      'content-type': 'application/json',
      authorization: 'Bearer test-hop-b-token',
      'x-request-id': 'req-json-invalid',
    })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await readJson(response), {
    status: 'error',
    code: 'JSON_INVALID',
    message: 'Malformed JSON request body',
    request_id: 'req-json-invalid',
  });
});

test('ingest rejects unsupported schema version with deterministic envelope', async () => {
  const payload = buildValidHopBBatch({ schema_version: '2.0.0' });
  const response = await handleHopBIngestPost(
    buildRequest(JSON.stringify(payload), {
      'content-type': 'application/json',
      authorization: 'Bearer test-hop-b-token',
      'x-request-id': 'req-schema-invalid',
    })
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await readJson(response), {
    status: 'error',
    code: 'SCHEMA_VERSION_UNSUPPORTED',
    message: 'Unsupported schema_version: 2.0.0',
    request_id: 'req-schema-invalid',
  });
});

test('ingest rejects missing records with deterministic envelope', async () => {
  const payload = buildValidHopBBatch();
  delete payload.records;
  delete payload.record_count;

  const response = await handleHopBIngestPost(
    buildRequest(JSON.stringify(payload), {
      'content-type': 'application/json',
      authorization: 'Bearer test-hop-b-token',
      'x-request-id': 'req-records-missing',
    })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await readJson(response), {
    status: 'error',
    code: 'PAYLOAD_INVALID',
    message: 'Missing required fields: record_count, records',
    request_id: 'req-records-missing',
  });
});

test('ingest surfaces batch conflict with deterministic envelope', async () => {
  const payload = buildValidHopBBatch({ batch_id: '00000000-0000-4000-8000-000000000123' });

  const response = await handleHopBIngestPost(
    buildRequest(JSON.stringify(payload), {
      'content-type': 'application/json',
      authorization: 'Bearer test-hop-b-token',
      'x-request-id': 'req-batch-conflict',
    }),
    {
      async recordHopBReceipt() {
        return {
          ok: false,
          statusCode: 409,
          error: {
            code: 'BATCH_CONFLICT',
            message: `Batch ${payload.batch_id} already received with different payload hash`,
          },
        };
      },
    }
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await readJson(response), {
    status: 'error',
    code: 'BATCH_CONFLICT',
    message: `Batch ${payload.batch_id} already received with different payload hash`,
    request_id: 'req-batch-conflict',
  });
});

test('ingest rejects empty records array with BATCH_EMPTY code', async () => {
  const payload = buildValidHopBBatch({ records: [], record_count: 0 });

  const response = await handleHopBIngestPost(
    buildRequest(JSON.stringify(payload), {
      'content-type': 'application/json',
      authorization: 'Bearer test-hop-b-token',
      'x-request-id': 'req-empty-records',
    })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await readJson(response), {
    status: 'error',
    code: 'BATCH_EMPTY',
    message: 'records must not be empty',
    request_id: 'req-empty-records',
  });
});

test('ingest rejects malformed bearer token format with AUTH_MISSING code', async () => {
  const response = await handleHopBIngestPost(
    buildRequest(JSON.stringify(buildValidHopBBatch()), {
      'content-type': 'application/json',
      authorization: 'Token abc123',
      'x-request-id': 'req-auth-bad-format',
    })
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await readJson(response), {
    status: 'error',
    code: 'AUTH_MISSING',
    message: 'Authorization header must use Bearer token',
    request_id: 'req-auth-bad-format',
  });
});

test('ingest surfaces internal error when ledger throws', async () => {
  const payload = buildValidHopBBatch({ batch_id: '00000000-0000-4000-8000-000000000999' });

  const response = await handleHopBIngestPost(
    buildRequest(JSON.stringify(payload), {
      'content-type': 'application/json',
      authorization: 'Bearer test-hop-b-token',
      'x-request-id': 'req-ledger-error',
    }),
    {
      async recordHopBReceipt() {
        throw new Error('database connection lost');
      },
    }
  );

  assert.equal(response.status, 500);
  const json = await readJson(response);
  assert.equal(json.status, 'error');
  assert.equal(json.code, 'INGEST_INTERNAL_ERROR');
  assert.equal(json.message, 'database connection lost');
  assert.equal(json.request_id, 'req-ledger-error');
});

test('ingest surfaces internal error when writer throws', async () => {
  const payload = buildValidHopBBatch({ batch_id: '00000000-0000-4000-8000-000000000998' });

  const response = await handleHopBIngestPost(
    buildRequest(JSON.stringify(payload), {
      'content-type': 'application/json',
      authorization: 'Bearer test-hop-b-token',
      'x-request-id': 'req-writer-error',
    }),
    {
      async recordHopBReceipt() {
        return {
          ok: true,
          replay: false,
          logId: 999,
          batchId: payload.batch_id,
          recordCount: 1,
          insertedCount: 0,
          duplicateCount: 0,
          status: 'received',
          receivedAt: '2026-05-29T12:00:01Z',
          committedAt: null,
        };
      },
      async writeHopBCanonicalBatch() {
        throw new Error('write deadlock detected');
      },
    }
  );

  assert.equal(response.status, 500);
  const json = await readJson(response);
  assert.equal(json.status, 'error');
  assert.equal(json.code, 'INGEST_INTERNAL_ERROR');
  assert.equal(json.message, 'write deadlock detected');
  assert.equal(json.request_id, 'req-writer-error');
});
