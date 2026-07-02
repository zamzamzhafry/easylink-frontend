import pool from '@/lib/db';

// ponytail: module-level cache — schema does not change mid-process. Invalidation is
// process restart. Ceiling: if schema mutates at runtime (online migration mid-flight),
// callers needing fresh state should call tableExists(name, { skipCache: true }).
const _tableExistsCache = new Map();

export async function tableExists(tableName, { skipCache = false } = {}) {
  if (!skipCache && _tableExistsCache.has(tableName)) {
    return _tableExistsCache.get(tableName) === true;
  }
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
     LIMIT 1`,
    [tableName]
  );
  const exists = Array.isArray(rows) && rows.length > 0;
  if (!skipCache) _tableExistsCache.set(tableName, exists);
  return exists;
}

export async function columnExists(tableName, columnName, { skipCache = false } = {}) {
  const cacheKey = `${tableName}.${columnName}`;
  if (!skipCache && _tableExistsCache.has(cacheKey)) {
    return _tableExistsCache.get(cacheKey) === true;
  }
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  const exists = Array.isArray(rows) && rows.length > 0;
  if (!skipCache) _tableExistsCache.set(cacheKey, exists);
  return exists;
}
