import pool from './db.js';

export async function recordHopBReceipt({
  batchId,
  sourceSdk,
  deviceSn,
  recordCount,
  payloadHash,
}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existingRows] = await connection.query(
      `
        SELECT id, batch_id, payload_hash, record_count, inserted_count, duplicate_count, status, received_at, committed_at
        FROM tb_hop_b_ingest_log
        WHERE batch_id = ?
        LIMIT 1
      `,
      [batchId]
    );

    const existing = existingRows[0] || null;
    if (existing) {
      await connection.commit();

      if (String(existing.payload_hash || '') !== String(payloadHash)) {
        return {
          ok: false,
          statusCode: 409,
          error: {
            code: 'BATCH_CONFLICT',
            message: `Batch ${batchId} already received with different payload hash`,
          },
        };
      }

      return {
        ok: true,
        replay: true,
        logId: Number(existing.id || 0),
        batchId: existing.batch_id,
        recordCount: Number(existing.record_count || 0),
        insertedCount: Number(existing.inserted_count || 0),
        duplicateCount: Number(existing.duplicate_count || 0),
        status: existing.status || 'received',
        receivedAt: existing.received_at || null,
        committedAt: existing.committed_at || null,
      };
    }

    const [insertResult] = await connection.query(
      `
        INSERT INTO tb_hop_b_ingest_log (
          batch_id,
          source_sdk,
          device_sn,
          record_count,
          inserted_count,
          duplicate_count,
          status,
          payload_hash
        ) VALUES (?, ?, ?, ?, 0, 0, 'received', ?)
      `,
      [batchId, sourceSdk, deviceSn, recordCount, payloadHash]
    );

    const logId = Number(insertResult.insertId || 0);

    const [receiptRows] = await connection.query(
      `
        SELECT id, batch_id, record_count, inserted_count, duplicate_count, status, received_at, committed_at
        FROM tb_hop_b_ingest_log
        WHERE id = ?
        LIMIT 1
      `,
      [logId]
    );

    await connection.commit();

    const receipt = receiptRows[0] || null;

    return {
      ok: true,
      replay: false,
      logId,
      batchId: receipt?.batch_id || batchId,
      recordCount: Number(receipt?.record_count || recordCount),
      insertedCount: Number(receipt?.inserted_count || 0),
      duplicateCount: Number(receipt?.duplicate_count || 0),
      status: receipt?.status || 'received',
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
