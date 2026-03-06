import pool from '@/lib/db';

let cachedColumns = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

export async function getKaryawanColumns() {
  const now = Date.now();
  if (cachedColumns && (now - cachedAt) < CACHE_TTL_MS) {
    return cachedColumns;
  }

  const [rows] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'tb_karyawan'`
  );

  cachedColumns = new Set(rows.map((row) => row.COLUMN_NAME));
  cachedAt = now;
  return cachedColumns;
}

export async function hasKaryawanColumn(columnName) {
  const columns = await getKaryawanColumns();
  return columns.has(columnName);
}
