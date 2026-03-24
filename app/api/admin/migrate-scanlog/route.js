import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAuthContextFromCookies } from '@/lib/auth-session';

export async function POST() {
  try {
    const auth = await getAuthContextFromCookies();
    if (!auth || !auth.is_admin) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Safely move data from legacy tb_scanlog to the new scanlog_events structure
      // Deduping based on source_event_key (sn + pin + scan_date)
      const [result] = await connection.query(`
        INSERT INTO scanlog_events (device_sn, pin, scan_time, verify_mode, source_event_key)
        SELECT 
          sn AS device_sn,
          pin,
          scan_date AS scan_time,
          verify_mode,
          CONCAT(sn, '_', pin, '_', DATE_FORMAT(scan_date, '%Y%m%d%H%i%s')) AS source_event_key
        FROM tb_scanlog
        ON DUPLICATE KEY UPDATE scan_time = VALUES(scan_time)
      `);

      await connection.commit();
      connection.release();

      return NextResponse.json({
        ok: true,
        message: 'Migration successful',
        rowsAffected: result.affectedRows
      });
    } catch (dbError) {
      await connection.rollback();
      connection.release();
      throw dbError;
    }
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to migrate scanlogs' },
      { status: 500 }
    );
  }
}
