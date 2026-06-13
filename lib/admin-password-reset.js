// lib/admin-password-reset.js
//
// Pure core for the admin password-reset endpoint (Task 19/M4), split
// out from the Next route so it can be unit-tested without the
// next/headers request scope. The route supplies the already-resolved
// auth context, the parsed JSON body, and the db pool; this function
// owns the security gate, validation, bcrypt hashing, the parameterised
// UPDATE, and the audit write.
import { z } from 'zod';
import { hashPassword } from '@/lib/password';
import { recordPasswordReset } from '@/lib/auth-audit';

const resetSchema = z.object({
  target_karyawan_id: z.coerce.number().int().positive(),
  new_password: z.string().min(8).max(200),
});

export async function handleAdminPasswordReset({ auth, body, pool }) {
  if (!auth) return { status: 401, json: { ok: false, error: 'Login required.' } };
  // Generic 403 — must not reveal that the gate is specifically an admin probe.
  if (auth.is_admin !== true) return { status: 403, json: { ok: false, error: 'Forbidden' } };

  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) {
    return { status: 400, json: { ok: false, error: 'Invalid input' } };
  }

  const targetKaryawanId = parsed.data.target_karyawan_id;
  const newPasswordHash = await hashPassword(parsed.data.new_password);

  const connection = await pool.getConnection();
  try {
    const [result] = await connection.query(
      'UPDATE tb_karyawan_auth SET password_hash = ? WHERE karyawan_id = ?',
      [newPasswordHash, targetKaryawanId]
    );

    if (!result || result.affectedRows === 0) {
      return { status: 400, json: { ok: false, error: 'Target auth account not found' } };
    }

    await recordPasswordReset(
      { actorKaryawanId: auth.karyawan_id ?? null, targetKaryawanId },
      connection
    );

    return { status: 200, json: { ok: true } };
  } finally {
    connection.release();
  }
}
