import pool from '@/lib/db';

let cachedColumns = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

export async function getShiftColumns() {
  const now = Date.now();
  if (cachedColumns && now - cachedAt < CACHE_TTL_MS) {
    return cachedColumns;
  }

  const [rows] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'tb_shift_type'`
  );

  cachedColumns = new Set(rows.map((row) => row.COLUMN_NAME));
  cachedAt = now;
  return cachedColumns;
}

export async function hasShiftColumn(columnName) {
  const columns = await getShiftColumns();
  return columns.has(columnName);
}

