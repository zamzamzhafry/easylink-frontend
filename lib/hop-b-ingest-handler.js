import { randomUUID, timingSafeEqual } from 'node:crypto';

import {
  computeHopBPayloadHash,
  HOP_B_SCHEMA_VERSION,
  HOP_B_SOURCE_SDK,
  buildHopBSourceEventKey,
  validateHopBBatchPayload,
} from './hop-b-ingest-contract.js';
import { recordHopBReceipt } from './hop-b-ingest-ledger.js';
import { writeHopBCanonicalBatch } from './hop-b-ingest-writer.js';
import { mergeSafeEventsIntoLegacy } from './scanlog-legacy-mirror.js';

function buildRequestId(request) {
  const headerValue = request.headers.get('x-request-id');
  return typeof headerValue === 'string' && headerValue.trim() ? headerValue.trim() : randomUUID();
}

// Constant-time token comparison. timingSafeEqual throws on length mismatch
// (leaking length), so compare equal-length fixed hashes instead.
function safeTokenEquals(provided, expected) {
  const a = Buffer.from(String(provided ?? ''));
  const b = Buffer.from(String(expected ?? ''));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function jsonResponse(body, status) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

function errorResponse({ status, code, message, requestId }) {
  return jsonResponse(
    {
      status: 'error',
      code,
      message,
      request_id: requestId,
    },
    status
  );
}

function successResponse({ requestId, receipt, replay }) {
  return jsonResponse(
    {
      status: 'ok',
      code: replay ? 'BATCH_REPLAYED' : 'BATCH_ACCEPTED',
      message: replay ? 'Batch already committed' : 'Batch committed',
      request_id: requestId,
      ack: {
        batch_id: receipt.batchId,
        record_count: receipt.recordCount,
        inserted_count: receipt.insertedCount,
        duplicate_count: receipt.duplicateCount,
        replay,
        received_at: receipt.receivedAt,
        committed_at: receipt.committedAt,
      },
    },
    200
  );
}

function authenticateRequest(request) {
  const configuredToken = process.env.HOP_B_AUTH_TOKEN;
  if (!configuredToken) {
    return {
      ok: false,
      status: 500,
      code: 'AUTH_NOT_CONFIGURED',
      message: 'HOP_B_AUTH_TOKEN not configured',
    };
  }

  const headerValue = request.headers.get('authorization');
  if (!headerValue || !headerValue.trim()) {
    return {
      ok: false,
      status: 401,
      code: 'AUTH_MISSING',
      message: 'Authorization header required',
    };
  }

  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]?.trim()) {
    return {
      ok: false,
      status: 401,
      code: 'AUTH_MISSING',
      message: 'Authorization header must use Bearer token',
    };
  }

  if (!safeTokenEquals(match[1].trim(), configuredToken)) {
    return {
      ok: false,
      status: 401,
      code: 'AUTH_INVALID',
      message: 'Bearer token invalid',
    };
  }

  return { ok: true };
}

function hasJsonContentType(request) {
  const contentType = request.headers.get('content-type') || '';
  return contentType.toLowerCase().includes('application/json');
}

async function parseJsonBody(request, requestId) {
  if (!hasJsonContentType(request)) {
    return {
      ok: false,
      response: errorResponse({
        status: 415,
        code: 'CONTENT_TYPE_INVALID',
        message: 'Content-Type must be application/json',
        requestId,
      }),
    };
  }

  try {
    const body = await request.json();
    return { ok: true, body };
  } catch {
    return {
      ok: false,
      response: errorResponse({
        status: 400,
        code: 'JSON_INVALID',
        message: 'Malformed JSON request body',
        requestId,
      }),
    };
  }
}

function deriveScanDateRange(records) {
  let from = null;
  let to = null;
  for (const record of records) {
    const scanDate = record?.scan_date;
    if (typeof scanDate !== 'string' || !scanDate) continue;
    if (from === null || scanDate < from) from = scanDate;
    if (to === null || scanDate > to) to = scanDate;
  }
  return { from, to };
}

async function mirrorHopBBatchToLegacy({ records, batchId, requestId, mergeLegacy }) {
  if (!Array.isArray(records) || records.length === 0) return;

  const { from, to } = deriveScanDateRange(records);
  if (!from && !to && !batchId) return;

  try {
    await mergeLegacy({ batchId, from, to });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      JSON.stringify({
        event: 'hop_b_legacy_mirror_failed',
        request_id: requestId,
        batch_id: batchId,
        from,
        to,
        message,
      })
    );
  }
}

export async function handleHopBIngestPost(request, deps = {}) {
  const requestId = buildRequestId(request);
  const recordReceipt = deps.recordHopBReceipt || recordHopBReceipt;
  const writeCanonicalBatch = deps.writeHopBCanonicalBatch || writeHopBCanonicalBatch;
  const mergeLegacy = deps.mergeSafeEventsIntoLegacy || mergeSafeEventsIntoLegacy;

  try {
    const auth = authenticateRequest(request);
    if (!auth.ok) {
      return errorResponse({
        status: auth.status,
        code: auth.code,
        message: auth.message,
        requestId,
      });
    }

    const parsed = await parseJsonBody(request, requestId);
    if (!parsed.ok) return parsed.response;

    const validation = validateHopBBatchPayload(parsed.body);
    if (!validation.ok) {
      return errorResponse({
        status: validation.code === 'SCHEMA_VERSION_UNSUPPORTED' ? 409 : 400,
        code: validation.code,
        message: validation.message,
        requestId,
      });
    }

    const payload = validation.value;
    const payloadHash = computeHopBPayloadHash(payload);

    const receipt = await recordReceipt({
      batchId: payload.batch_id,
      sourceSdk: payload.source_sdk,
      deviceSn: payload.device_sn,
      recordCount: payload.record_count,
      payloadHash,
    });

    if (!receipt.ok) {
      return errorResponse({
        status: receipt.statusCode,
        code: receipt.error.code,
        message: receipt.error.message,
        requestId,
      });
    }

    if (receipt.replay) {
      return successResponse({ requestId, receipt, replay: true });
    }

    const writeResult = await writeCanonicalBatch({
      ingestLogId: receipt.logId,
      sourceBatchId: payload.batch_id,
      records: payload.records.map((record) => ({
        ...record,
        source_sdk: payload.source_sdk,
      })),
    });

    await mirrorHopBBatchToLegacy({
      records: payload.records,
      batchId: receipt.logId,
      requestId,
      mergeLegacy,
    });

    return successResponse({
      requestId,
      receipt: {
        ...writeResult,
        batchId: payload.batch_id,
      },
      replay: false,
    });
  } catch (error) {
    return errorResponse({
      status: 500,
      code: 'INGEST_INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unexpected ingest failure',
      requestId,
    });
  }
}

export function buildValidHopBBatch(overrides = {}) {
  const baseRecord = {
    device_sn: 'Fio66208021230737',
    scan_date: '2026-05-29',
    scan_time: '08:15:42',
    pin: '10023',
    verify_mode: 1,
    io_mode: 0,
    workcode: 0,
  };
  baseRecord.source_event_key = buildHopBSourceEventKey(baseRecord);

  const defaultPayload = {
    schema_version: HOP_B_SCHEMA_VERSION,
    batch_id: '00000000-0000-4000-8000-000000000001',
    sent_at: '2026-05-29T12:00:00Z',
    source_sdk: HOP_B_SOURCE_SDK,
    device_sn: baseRecord.device_sn,
    record_count: 1,
    records: [baseRecord],
  };

  const payload = {
    ...defaultPayload,
    ...overrides,
  };

  if (!overrides.records) {
    payload.records = defaultPayload.records.map((record) => ({ ...record }));
  }

  if (overrides.records && Array.isArray(overrides.records)) {
    payload.record_count = overrides.record_count ?? overrides.records.length;
  }

  return payload;
}
