import pool from './db.js';

const RECENT_BATCH_LIMIT = 10;

export async function readHopBIngestStatus({ connectionPool } = {}) {
  const activePool = connectionPool || pool;
  const connection = await activePool.getConnection();

  try {
    const [recentRows] = await connection.query(
      `
        SELECT batch_id, status, received_at, committed_at, inserted_count, duplicate_count
        FROM tb_hop_b_ingest_log
        ORDER BY received_at DESC
        LIMIT ?
      `,
      [RECENT_BATCH_LIMIT],
    );

    const [countRows] = await connection.query(
      `
        SELECT status, COUNT(*) AS cnt
        FROM tb_hop_b_ingest_log
        GROUP BY status
      `,
    );

    const [summaryRows] = await connection.query(
      `
        SELECT
          MAX(committed_at) AS last_committed_at,
          SUM(record_count) AS total_received,
          SUM(inserted_count) AS total_inserted,
          SUM(duplicate_count) AS total_duplicates
        FROM tb_hop_b_ingest_log
      `,
    );

    const statusCounts = {};
    let totalCommitted = 0;
    let totalFailed = 0;
    let totalProcessing = 0;
    for (const row of countRows) {
      statusCounts[row.status] = Number(row.cnt);
    }
    totalCommitted = statusCounts.committed || 0;
    totalFailed = statusCounts.failed || 0;
    totalProcessing = statusCounts.processing || 0;

    const summary = summaryRows[0] || {};

    const recent_batches = recentRows.map((row) => ({
      batch_id: row.batch_id,
      status: row.status,
      received_at: row.received_at,
      committed_at: row.committed_at,
      inserted_count: Number(row.inserted_count || 0),
      duplicate_count: Number(row.duplicate_count || 0),
    }));

    return {
      last_committed_at: summary.last_committed_at || null,
      total_received: Number(summary.total_received || 0),
      total_committed: totalCommitted,
      total_failed: totalFailed,
      total_processing: totalProcessing,
      total_inserted: Number(summary.total_inserted || 0),
      total_duplicates: Number(summary.total_duplicates || 0),
      recent_batches,
    };
  } finally {
    connection.release();
  }
}

export async function buildHopBStatusResponse({ connectionPool } = {}) {
  const linuxIngest = await readHopBIngestStatus({ connectionPool });

  return {
    linux_ingest: linuxIngest,
    timestamp: new Date().toISOString(),
    source: 'hop-b-status',
  };
}
