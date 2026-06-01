import pool from './lib/db.js'; async function test() { try { const [rows] = await pool.query('SELECT 1'); console.log(rows); } catch (e) { console.error(e); } process.exit(0); } test();
