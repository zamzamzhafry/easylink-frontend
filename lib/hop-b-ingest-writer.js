import pool from './db.js';

function normalizeWorkcode(value) {
  if (value === null || value === undefined || value === '') return '0';
  return String(value);
}

function buildScanAt(record) {
  return `${record.scan_date} ${record.scan_time}`;
}

export function buildHopBCanonicalPayload(record, ingestLogId) {
  return {
    ...record,
    _trace: {
      hop_b_ingest_log_id: ingestLogId,
      source_batch_id: record.source_batch_id || null,
      source_device_sn: record.device_sn,
      source_event_key: record.source_event_key,
    },
  };
}

function buildInsertParams(record, ingestLogId) {
  return [
    record.source_event_key,
    record.source_sdk,
    record.device_sn,
    record.pin,
    buildScanAt(record),
    record.scan_date,
    record.scan_time,
    record.verify_mode,
    record.io_mode,
    normalizeWorkcode(record.workcode),
    JSON.stringify(buildHopBCanonicalPayload(record, ingestLogId)),
    ingestLogId,
  ];
}

export async function insertHopBSafeEvents(connection, { ingestLogId, records }) {
  if (!records.length) return 0;

  const placeholders = records.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?)').join(', ');
  const params = records.flatMap((record) => buildInsertParams(record, ingestLogId));

  const [result] = await connection.query(
    `
      INSERT IGNORE INTO tb_scanlog_safe_events (
        source_event_key,
        source_sdk,
        sn,
        pin,
        scan_at,
        scan_date,
        scan_time,
        verifymode,
        iomode,
        workcode,
        raw_payload,
        batch_id
      ) VALUES ${placeholders}
    `,
    params
  );

  return Number(result.affectedRows || 0);
}

async function finalizeReceipt(connection, { ingestLogId, insertedCount, duplicateCount, errorMessage = null }) {
  await connection.query(
    `
      UPDATE tb_hop_b_ingest_log
      SET inserted_count = ?,
          duplicate_count = ?,
          status = 'committed',
          error_message = ?,
          committed_at = NOW()
      WHERE id = ?
      LIMIT 1
    `,
    [insertedCount, duplicateCount, errorMessage, ingestLogId]
  );

  const [rows] = await connection.query(
    `
      SELECT id, batch_id, record_count, inserted_count, duplicate_count, status, received_at, committed_at
      FROM tb_hop_b_ingest_log
      WHERE id = ?
      LIMIT 1
    `,
    [ingestLogId]
  );

  return rows[0] || null;
}

export async function writeHopBCanonicalBatch({ ingestLogId, sourceBatchId = null, records }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const recordsWithTrace = records.map((record) => ({
      ...record,
      source_batch_id: sourceBatchId,
    }));
    const insertedCount = await insertHopBSafeEvents(connection, {
      ingestLogId,
      records: recordsWithTrace,
    });
    const duplicateCount = records.length - insertedCount;
    const receipt = await finalizeReceipt(connection, {
      ingestLogId,
      insertedCount,
      duplicateCount,
    });

    await connection.commit();

    return {
      ok: true,
      replay: false,
      logId: Number(receipt?.id || ingestLogId),
      batchId: receipt?.batch_id || sourceBatchId,
      recordCount: Number(receipt?.record_count || records.length),
      insertedCount: Number(receipt?.inserted_count || insertedCount),
      duplicateCount: Number(receipt?.duplicate_count || duplicateCount),
      status: receipt?.status || 'committed',
      receivedAt: receipt?.received_at || null,
      committedAt: receipt?.committed_at || null,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
