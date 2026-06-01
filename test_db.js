import pool from './lib/db.js'; async function test() { const [rows] = await pool.query('SHOW TABLES'); console.log(rows); process.exit(0); } test();
