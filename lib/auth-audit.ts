// lib/auth-audit.ts — Append-only writers for the role-change audit trail.
//
// All writes go to `tb_role_change_audit` (additive, see
// scripts/migration-task-5-role-change-audit.sql). The helper accepts an
// optional `executor` so callers inside an existing connection/transaction
// can pass a `PoolConnection` and stay within their unit of work. When no
// executor is supplied the default exported pool is used.

import type { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';
import pool from '@/lib/db';

export type RoleChangeAction = 'grant' | 'revoke';

export type RoleChangeAuditInput = {
  actorKaryawanId: number | null | undefined;
  targetKaryawanId: number;
  action: RoleChangeAction;
  roleKey: string;
  groupId?: number | null;
};

// Accept either the pool or a checked-out connection — both expose `.query`.
export type AuditSqlExecutor = Pick<Pool | PoolConnection, 'query'>;

/**
 * Insert exactly one audit row describing a role grant or revoke.
 * Parameterised; no string concatenation of caller input.
 *
 * Returns the inserted row id (auto-increment PK).
 */
export async function recordRoleChange(
  input: RoleChangeAuditInput,
  executor: AuditSqlExecutor = pool
): Promise<number> {
  const { actorKaryawanId, targetKaryawanId, action, roleKey, groupId } = input;

  if (!Number.isInteger(targetKaryawanId) || targetKaryawanId <= 0) {
    throw new Error('recordRoleChange: targetKaryawanId must be a positive integer');
  }
  if (action !== 'grant' && action !== 'revoke') {
    throw new Error(`recordRoleChange: invalid action ${String(action)}`);
  }
  if (typeof roleKey !== 'string' || roleKey.length === 0) {
    throw new Error('recordRoleChange: roleKey must be a non-empty string');
  }

  const actor =
    typeof actorKaryawanId === 'number' && Number.isInteger(actorKaryawanId) && actorKaryawanId > 0
      ? actorKaryawanId
      : null;
  const group =
    typeof groupId === 'number' && Number.isInteger(groupId) && groupId > 0 ? groupId : null;

  const [result] = await executor.query<ResultSetHeader>(
    `INSERT INTO tb_role_change_audit
       (actor_karyawan_id, target_karyawan_id, action, role_key, group_id)
     VALUES (?, ?, ?, ?, ?)`,
    [actor, targetKaryawanId, action, roleKey, group]
  );

  return result.insertId;
}

// ── Password-reset audit (Task 19/M4) ──────────────────────────────
// Sibling of recordRoleChange. Writes to its OWN table
// (`tb_password_reset_audit`, see
// scripts/migration-task-19-password-reset-audit.sql) instead of
// extending the tb_role_change_audit ENUM — that would require an
// ALTER and couple with the blocked Task 4 enum-narrow. We store ONLY
// the subject (who reset whose password, when). NEVER the password.

export type PasswordResetAuditInput = {
  actorKaryawanId: number | null | undefined;
  targetKaryawanId: number;
};

/**
 * Insert exactly one audit row describing an admin password reset.
 * Parameterised; stores no password material. Returns the inserted PK.
 */
export async function recordPasswordReset(
  input: PasswordResetAuditInput,
  executor: AuditSqlExecutor = pool
): Promise<number> {
  const { actorKaryawanId, targetKaryawanId } = input;

  if (!Number.isInteger(targetKaryawanId) || targetKaryawanId <= 0) {
    throw new Error('recordPasswordReset: targetKaryawanId must be a positive integer');
  }

  const actor =
    typeof actorKaryawanId === 'number' && Number.isInteger(actorKaryawanId) && actorKaryawanId > 0
      ? actorKaryawanId
      : null;

  const [result] = await executor.query<ResultSetHeader>(
    `INSERT INTO tb_password_reset_audit
       (actor_karyawan_id, target_karyawan_id)
     VALUES (?, ?)`,
    [actor, targetKaryawanId]
  );

  return result.insertId;
}
