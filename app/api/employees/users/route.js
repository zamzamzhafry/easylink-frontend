import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  const [rows] = await pool.query(`
    SELECT pin, nama, privilege
    FROM tb_user
    ORDER BY nama ASC, pin ASC
  `);

  return NextResponse.json(rows);
}
