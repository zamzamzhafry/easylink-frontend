-- ============================================================
-- TASK 5 (M3): ROLE-CHANGE AUDIT TABLE — ADDITIVE ONLY
-- Purpose:
--   Append-only audit trail for role-grant / role-revoke events
--   (currently: group-leader assign/remove via /api/groups).
--
-- IMPORTANT:
--   - This migration does NOT drop or mutate any legacy table.
--   - No FKs (cross-DB portability + tolerates karyawan rows that
--     may be soft-deleted after the audit row is written).
--   - Idempotent: safe to re-run.
-- ============================================================

USE `demo_easylinksdk`;

CREATE TABLE IF NOT EXISTS `tb_role_change_audit` (
  `id`                  INT(11)      NOT NULL AUTO_INCREMENT,
  `actor_karyawan_id`   INT(11)      NULL     COMMENT 'tb_karyawan.id of the admin/HR performing the change; NULL if unresolved',
  `target_karyawan_id`  INT(11)      NOT NULL COMMENT 'tb_karyawan.id whose role was granted or revoked',
  `action`              ENUM('grant','revoke') NOT NULL COMMENT 'grant = role assigned; revoke = role removed',
  `role_key`            VARCHAR(64)  NOT NULL COMMENT 'Canonical role identifier (e.g. group_leader, admin, viewer)',
  `group_id`            INT(11)      NULL     COMMENT 'tb_group.id for group-scoped roles; NULL for global-scope roles',
  `created_at`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Event timestamp (server local time)',
  PRIMARY KEY (`id`),
  KEY `idx_role_change_audit_target` (`target_karyawan_id`, `created_at`),
  KEY `idx_role_change_audit_actor`  (`actor_karyawan_id`,  `created_at`),
  KEY `idx_role_change_audit_role`   (`role_key`,           `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Append-only audit log of role grants/revokes (additive, Task 5/M3).';
