-- ============================================================
-- TASK 19 (M4): ADMIN PASSWORD-RESET AUDIT TABLE — ADDITIVE ONLY
-- Purpose:
--   Append-only audit trail for admin-driven password resets on the
--   NIP lane (tb_karyawan_auth.password_hash). Admin-only, no
--   self-service. Records WHO reset WHOSE password and WHEN — never
--   the password value itself.
--
-- DESIGN CHOICE (documented):
--   A SEPARATE table (not an ENUM extension of tb_role_change_audit).
--   Adding action='password_reset' to that ENUM would require an
--   ALTER on tb_role_change_audit, which couples with the blocked
--   Task 4 enum-narrow work. A sibling table is purely additive and
--   keeps the two audit concerns independent.
--
-- IMPORTANT:
--   - Does NOT drop or mutate any legacy table.
--   - No FKs (cross-DB portability + tolerates karyawan rows that may
--     be soft-deleted after the audit row is written).
--   - Stores NO password material (plaintext or hash). Subject only.
--   - Idempotent: safe to re-run.
-- ============================================================

USE `demo_easylinksdk`;

CREATE TABLE IF NOT EXISTS `tb_password_reset_audit` (
  `id`                  INT(11)      NOT NULL AUTO_INCREMENT,
  `actor_karyawan_id`   INT(11)      NULL     COMMENT 'tb_karyawan.id of the admin performing the reset; NULL if unresolved',
  `target_karyawan_id`  INT(11)      NOT NULL COMMENT 'tb_karyawan.id whose password_hash was reset',
  `created_at`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Event timestamp (server local time)',
  PRIMARY KEY (`id`),
  KEY `idx_password_reset_audit_target` (`target_karyawan_id`, `created_at`),
  KEY `idx_password_reset_audit_actor`  (`actor_karyawan_id`,  `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Append-only audit log of admin password resets (additive, Task 19/M4). No password material stored.';
