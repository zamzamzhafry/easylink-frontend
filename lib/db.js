// lib/db.js  — MySQL2 connection pool (XAMPP defaults)
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host:     'localhost',
  port:     3306,
  user:     'root',
  password: '',
  database: 'demo_easylinksdk',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '+07:00', // WIB
});

export default pool;
