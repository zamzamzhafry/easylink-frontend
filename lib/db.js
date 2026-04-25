// lib/db.js  — MySQL2 connection pool (XAMPP defaults for dev only)
import mysql from 'mysql2/promise';

const isProd = process.env.NODE_ENV === 'production';

if (isProd) {
  const missing = ['DB_HOST', 'DB_USER', 'DB_NAME'].filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required DB env vars in production: ${missing.join(', ')}`);
  }
  // DB_PASSWORD is checked separately — it must be explicitly set (even if empty)
  if (process.env.DB_PASSWORD === undefined) {
    throw new Error('DB_PASSWORD env var must be explicitly set in production');
  }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME || 'demo_easylinksdk',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  timezone: process.env.DB_TIMEZONE || '+07:00', // WIB
});

export default pool;
