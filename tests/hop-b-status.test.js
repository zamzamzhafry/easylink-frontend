import assert from 'node:assert/strict';
import test from 'node:test';

const { readHopBIngestStatus, buildHopBStatusResponse } = await import('../lib/hop-b-status.js');

function createMockPool(rows) {
  const queries = rows || {};
  const released = { value: false };

  const connection = {
    async query(sql, params) {
      const trimmed = sql.trim().toLowerCase();

      if (trimmed.startsWith('select batch_id, status, received_at, committed_at')) {
        return [queries.recent || []];
      }
      if (trimmed.startsWith('select status, count(*)')) {
        return [queries.counts || []];
      }
      if (trimmed.includes('max(committed_at)')) {
        return [queries.summary || [{ last_committed_at: null, total_received: 0, total_inserted: 0, total_duplicates: 0 }]];
      }

      return [[]];
    },
    release() {
      released.value = true;
    },
  };

  return {
    async getConnection() {
      return connection;
    },
    _released: released,
  };
}

test('readHopBIngestStatus returns healthy status with batches', async () => {
  const mockPool = createMockPool({
    recent: [
      {
        batch_id: 'batch-001',
        status: 'committed',
        received_at: new Date('2026-05-29T10:00:00Z'),
        committed_at: new Date('2026-05-29T10:00:05Z'),
        inserted_count: 50,
        duplicate_count: 2,
      },
      {
        batch_id: 'batch-002',
        status: 'committed',
        received_at: new Date('2026-05-29T09:00:00Z'),
        committed_at: new Date('2026-05-29T09:00:03Z'),
        inserted_count: 30,
        duplicate_count: 0,
      },
    ],
    counts: [
      { status: 'committed', cnt: 10 },
      { status: 'failed', cnt: 1 },
    ],
    summary: [
      {
        last_committed_at: new Date('2026-05-29T10:00:05Z'),
        total_received: 200,
        total_inserted: 180,
        total_duplicates: 5,
      },
    ],
  });

  const result = await readHopBIngestStatus({ connectionPool: mockPool });

  assert.equal(result.total_committed, 10);
  assert.equal(result.total_failed, 1);
  assert.equal(result.total_processing, 0);
  assert.equal(result.total_received, 200);
  assert.equal(result.total_inserted, 180);
  assert.equal(result.total_duplicates, 5);
  assert.equal(result.recent_batches.length, 2);
  assert.equal(result.recent_batches[0].batch_id, 'batch-001');
  assert.equal(result.recent_batches[0].status, 'committed');
  assert.equal(result.recent_batches[0].inserted_count, 50);
  assert.ok(mockPool._released.value, 'connection should be released');
});

test('readHopBIngestStatus handles empty state', async () => {
  const mockPool = createMockPool({
    recent: [],
    counts: [],
    summary: [{ last_committed_at: null, total_received: 0, total_inserted: 0, total_duplicates: 0 }],
  });

  const result = await readHopBIngestStatus({ connectionPool: mockPool });

  assert.equal(result.total_committed, 0);
  assert.equal(result.total_failed, 0);
  assert.equal(result.total_processing, 0);
  assert.equal(result.total_received, 0);
  assert.equal(result.recent_batches.length, 0);
  assert.equal(result.last_committed_at, null);
  assert.ok(mockPool._released.value, 'connection should be released');
});

test('buildHopBStatusResponse returns full payload', async () => {
  const mockPool = createMockPool({
    recent: [
      {
        batch_id: 'batch-100',
        status: 'committed',
        received_at: new Date('2026-05-29T12:00:00Z'),
        committed_at: new Date('2026-05-29T12:00:02Z'),
        inserted_count: 100,
        duplicate_count: 0,
      },
    ],
    counts: [{ status: 'committed', cnt: 5 }],
    summary: [{
      last_committed_at: new Date('2026-05-29T12:00:02Z'),
      total_received: 500,
      total_inserted: 490,
      total_duplicates: 10,
    }],
  });

  const payload = await buildHopBStatusResponse({ connectionPool: mockPool });

  assert.equal(payload.source, 'hop-b-status');
  assert.equal(payload.linux_ingest.total_committed, 5);
  assert.equal(payload.linux_ingest.recent_batches.length, 1);
  assert.ok(payload.timestamp, 'should have timestamp');
  assert.match(payload.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});
