import crypto from 'node:crypto';

export const HOP_B_SCHEMA_VERSION = '1.0.0';
export const HOP_B_SOURCE_SDK = 'fservice-hop-b';

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}:\d{2}$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isInteger(value) {
  return Number.isInteger(value);
}

export function buildHopBSourceEventKey(record) {
  return [
    record.device_sn,
    record.scan_date,
    record.scan_time,
    record.pin,
    record.verify_mode,
    record.io_mode,
    record.workcode,
  ].join('|');
}

export function computeHopBPayloadHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function validateRecord(record, index) {
  if (!isPlainObject(record)) {
    return `records[${index}] must be object`;
  }

  const normalized = {
    device_sn: asTrimmedString(record.device_sn),
    scan_date: asTrimmedString(record.scan_date),
    scan_time: asTrimmedString(record.scan_time),
    pin: asTrimmedString(record.pin),
    verify_mode: record.verify_mode,
    io_mode: record.io_mode,
    workcode: record.workcode,
    source_event_key: asTrimmedString(record.source_event_key),
  };

  if (!normalized.device_sn) return `records[${index}].device_sn required`;
  if (!DATE_PATTERN.test(normalized.scan_date)) return `records[${index}].scan_date must be YYYY-MM-DD`;
  if (!TIME_PATTERN.test(normalized.scan_time)) return `records[${index}].scan_time must be HH:MM:SS`;
  if (!normalized.pin) return `records[${index}].pin required`;
  if (!isInteger(normalized.verify_mode)) return `records[${index}].verify_mode must be integer`;
  if (!isInteger(normalized.io_mode)) return `records[${index}].io_mode must be integer`;
  if (!isInteger(normalized.workcode)) return `records[${index}].workcode must be integer`;
  if (!normalized.source_event_key) return `records[${index}].source_event_key required`;

  const expectedKey = buildHopBSourceEventKey(normalized);
  if (normalized.source_event_key !== expectedKey) {
    return `records[${index}].source_event_key mismatch`;
  }

  return null;
}

export function validateHopBBatchPayload(payload) {
  if (!isPlainObject(payload)) {
    return { ok: false, code: 'PAYLOAD_INVALID', message: 'Request body must be JSON object' };
  }

  const requiredFields = ['schema_version', 'batch_id', 'sent_at', 'source_sdk', 'device_sn', 'record_count', 'records'].filter(
    (field) => payload[field] === undefined
  );
  if (requiredFields.length > 0) {
    return {
      ok: false,
      code: 'PAYLOAD_INVALID',
      message: `Missing required fields: ${requiredFields.join(', ')}`,
    };
  }

  const schemaVersion = asTrimmedString(payload.schema_version);
  if (schemaVersion !== HOP_B_SCHEMA_VERSION) {
    return {
      ok: false,
      code: 'SCHEMA_VERSION_UNSUPPORTED',
      message: `Unsupported schema_version: ${schemaVersion || '(empty)'}`,
    };
  }

  const batchId = asTrimmedString(payload.batch_id);
  if (!UUID_V4_PATTERN.test(batchId)) {
    return { ok: false, code: 'PAYLOAD_INVALID', message: 'batch_id must be UUID v4' };
  }

  const sentAt = asTrimmedString(payload.sent_at);
  if (!ISO_UTC_PATTERN.test(sentAt)) {
    return { ok: false, code: 'PAYLOAD_INVALID', message: 'sent_at must be ISO 8601 UTC timestamp' };
  }

  const sourceSdk = asTrimmedString(payload.source_sdk);
  if (sourceSdk !== HOP_B_SOURCE_SDK) {
    return {
      ok: false,
      code: 'PAYLOAD_INVALID',
      message: `source_sdk must be ${HOP_B_SOURCE_SDK}`,
    };
  }

  const deviceSn = asTrimmedString(payload.device_sn);
  if (!deviceSn) {
    return { ok: false, code: 'PAYLOAD_INVALID', message: 'device_sn required' };
  }

  if (!isInteger(payload.record_count)) {
    return { ok: false, code: 'PAYLOAD_INVALID', message: 'record_count must be integer' };
  }

  if (!Array.isArray(payload.records)) {
    return { ok: false, code: 'PAYLOAD_INVALID', message: 'records must be array' };
  }

  if (payload.records.length === 0) {
    return { ok: false, code: 'BATCH_EMPTY', message: 'records must not be empty' };
  }

  if (payload.record_count !== payload.records.length) {
    return {
      ok: false,
      code: 'PAYLOAD_INVALID',
      message: `record_count mismatch: expected ${payload.records.length}, got ${payload.record_count}`,
    };
  }

  for (let index = 0; index < payload.records.length; index += 1) {
    const error = validateRecord(payload.records[index], index);
    if (error) {
      return { ok: false, code: 'PAYLOAD_INVALID', message: error };
    }

    if (asTrimmedString(payload.records[index].device_sn) !== deviceSn) {
      return {
        ok: false,
        code: 'PAYLOAD_INVALID',
        message: `records[${index}].device_sn must match top-level device_sn`,
      };
    }
  }

  return { ok: true, value: payload };
}
