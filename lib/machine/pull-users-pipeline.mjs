import pool from '../db.js';
import { normalizeMachineUser, streamUsersFromSdk } from '../easylink-sdk-client.js';

const CHECKPOINT_TABLE = 'machine_user_poll_checkpoints';
const CHUNK_TABLE = 'machine_user_poll_chunks';
const tableExistsCache = new Map();

async function hasTable(tableName) {
  if (tableExistsCache.has(tableName)) return tableExistsCache.get(tableName);
  try {
    const [rows] = await pool.query('SHOW TABLES LIKE ?', [tableName]);
    const exists = Array.isArray(rows) && rows.length > 0;
    tableExistsCache.set(tableName, exists);
    return exists;
  } catch (error) {
    console.error('machine user polling: failed to check table', tableName, error);
    tableExistsCache.set(tableName, false);
    return false;
  }
}

async function upsertCheckpoint(jobKey, values = {}) {
  if (!(await hasTable(CHECKPOINT_TABLE))) return;

  const {
    sourceSdk = 'windows-sdk',
    status = 'running',
    lastCursor = null,
    lastPage = null,
    pulledCount = 0,
    insertedCount = 0,
    updatedCount = 0,
    lastError = null,
  } = values;

  try {
    await pool.query(
      `INSERT INTO ${CHECKPOINT_TABLE} (job_key, source_sdk, status, last_cursor, last_page, pulled_count, inserted_count, updated_count, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         source_sdk = VALUES(source_sdk),
         status = VALUES(status),
         last_cursor = VALUES(last_cursor),
         last_page = VALUES(last_page),
         pulled_count = VALUES(pulled_count),
         inserted_count = VALUES(inserted_count),
         updated_count = VALUES(updated_count),
         last_error = VALUES(last_error)`,
      [
        jobKey,
        sourceSdk,
        status,
        lastCursor,
        lastPage,
        pulledCount,
        insertedCount,
        updatedCount,
        lastError,
      ]
    );
  } catch (error) {
    console.error('machine user polling: failed to upsert checkpoint', { jobKey, error });
  }
}

async function recordChunk(
  jobKey,
  { chunkIndex, cursor, rawRows = [], status = 'processed', validationErrors = [] }
) {
  if (!(await hasTable(CHUNK_TABLE))) return;

  try {
    await pool.query(
      `INSERT INTO ${CHUNK_TABLE} (job_key, chunk_index, cursor, raw_payload, status, validation_errors, processed_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        jobKey,
        chunkIndex,
        cursor,
        JSON.stringify(rawRows || []),
        status,
        validationErrors.length ? JSON.stringify(validationErrors) : null,
      ]
    );
  } catch (error) {
    console.error('machine user polling: failed to record chunk', { jobKey, chunkIndex, error });
  }
}

function normalizeAndValidateRows(rawRows) {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const validRows = [];
  const invalidRows = [];

  for (let index = 0; index < rows.length; index += 1) {
    const raw = rows[index];
    const normalized = normalizeMachineUser(raw);
    if (!normalized) {
      invalidRows.push({ index, reason: 'missing_pin', payload: raw ?? null });
      continue;
    }
    validRows.push(normalized);
  }

  return { validRows, invalidRows };
}

function appendValidationErrors(target, entries, limit = 25) {
  if (!entries.length || target.length >= limit) return;
  const remaining = Math.max(0, limit - target.length);
  target.push(...entries.slice(0, remaining));
}

async function importUsersToTbUser(users) {
  if (!users.length) return { inserted: 0, updated: 0 };

  const defaultPwd = process.env.EASYLINK_DEFAULT_USER_PASSWORD || '1234';
  let inserted = 0;
  let updated = 0;

  for (const user of users) {
    const [result] = await pool.query(
      `INSERT INTO tb_user (pin, nama, pwd, rfid, privilege)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         nama = VALUES(nama),
         rfid = VALUES(rfid),
         privilege = VALUES(privilege)`,
      [user.pin, user.nama, defaultPwd, user.rfid || '', Number(user.privilege || 0)]
    );

    if (result.affectedRows === 1) inserted += 1;
    if (result.affectedRows > 1) updated += 1;
  }

  return { inserted, updated };
}

export async function runMachineUserPollingJob({
  jobKey,
  source = 'windows-sdk',
  limit,
  page,
  maxPages,
} = {}) {
  const summary = {
    pulledCount: 0,
    insertedCount: 0,
    updatedCount: 0,
    invalidCount: 0,
    validationErrors: [],
    previewUsers: [],
  };
  let chunkCounter = 0;

  await upsertCheckpoint(jobKey, { status: 'running', sourceSdk: source, pulledCount: 0 });

  try {
    for await (const chunk of streamUsersFromSdk({ source, limit, page, maxPages })) {
      chunkCounter += 1;
      const chunkIndex = chunk.chunkIndex ?? chunkCounter;
      const rawRows = Array.isArray(chunk.rawRows) ? chunk.rawRows : [];
      summary.pulledCount += rawRows.length;

      const { validRows, invalidRows } = normalizeAndValidateRows(rawRows);
      summary.invalidCount += invalidRows.length;
      appendValidationErrors(
        summary.validationErrors,
        invalidRows.map((entry) => ({ ...entry, chunkIndex }))
      );

      if (!summary.previewUsers.length && validRows.length) {
        summary.previewUsers.push(...validRows.slice(0, 10));
      }

      const imported = validRows.length
        ? await importUsersToTbUser(validRows)
        : { inserted: 0, updated: 0 };
      summary.insertedCount += imported.inserted;
      summary.updatedCount += imported.updated;

      await recordChunk(jobKey, {
        chunkIndex,
        cursor: chunk.cursor ?? null,
        rawRows,
        status: 'processed',
        validationErrors: invalidRows.map((entry) => ({ ...entry, chunkIndex })),
      });

      await upsertCheckpoint(jobKey, {
        status: 'running',
        sourceSdk: chunk.source || source,
        lastCursor: chunk.cursor ?? null,
        lastPage: Number.isFinite(chunk.page) ? chunk.page : null,
        pulledCount: summary.pulledCount,
        insertedCount: summary.insertedCount,
        updatedCount: summary.updatedCount,
      });
    }

    await upsertCheckpoint(jobKey, {
      status: 'completed',
      sourceSdk: source,
      pulledCount: summary.pulledCount,
      insertedCount: summary.insertedCount,
      updatedCount: summary.updatedCount,
    });

    return {
      source,
      pulledCount: summary.pulledCount,
      insertedCount: summary.insertedCount,
      updatedCount: summary.updatedCount,
      previewUsers: summary.previewUsers.slice(0, 10),
      validationErrors: summary.validationErrors,
      invalidCount: summary.invalidCount,
    };
  } catch (error) {
    await upsertCheckpoint(jobKey, {
      status: 'failed',
      sourceSdk: source,
      pulledCount: summary.pulledCount,
      insertedCount: summary.insertedCount,
      updatedCount: summary.updatedCount,
      lastError: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
