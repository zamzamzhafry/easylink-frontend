-- ============================================================
-- V3 CLEAN-SLATE SCHEMA (ADDITIVE ONLY)
-- Purpose:
--   1) Define canonical employee-bound identity + role-policy model.
--   2) Define raw/computed attendance separation contract.
--   3) Provide compatibility bridge objects for legacy consumers.
--   4) Define monthly prediction target source model:
--      group override -> global fallback.
--
-- IMPORTANT:
--   - This migration does NOT drop or mutate legacy tables.
--   - Runtime cutover is NOT part of this migration.
-- ============================================================

USE `demo_easylinksdk`;

-- ------------------------------------------------------------
-- 1) Canonical employee-auth identity (1:1 with tb_karyawan)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cs_employee_auth_identity` (
  `employee_id`          INT(11)      NOT NULL COMMENT '1:1 reference to tb_karyawan.id',
  `login_nip`            VARCHAR(50)  NOT NULL COMMENT 'Canonical app-login identifier (NIP)',
  `password_hash`        VARCHAR(255) NOT NULL COMMENT 'Credential hash for application login',
  `identity_status`      ENUM('active', 'disabled', 'locked') NOT NULL DEFAULT 'active' COMMENT 'Auth account status',
  `password_updated_at`  DATETIME     NULL COMMENT 'Last password update timestamp',
  `last_login_at`        DATETIME     NULL COMMENT 'Last successful login timestamp',
  `created_at`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`employee_id`),
  UNIQUE KEY `uq_cs_employee_auth_identity_login_nip` (`login_nip`),
  CONSTRAINT `fk_cs_employee_auth_identity_employee`
    FOREIGN KEY (`employee_id`) REFERENCES `tb_karyawan`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Canonical employee-bound auth identity contract (1 employee : 1 auth account)';

-- ------------------------------------------------------------
-- 2) Identification method metadata per employee
--    Tracks all identifiers used by app/machine integrations.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cs_employee_identification_methods` (
  `id`                   BIGINT       NOT NULL AUTO_INCREMENT,
  `employee_id`          INT(11)      NOT NULL COMMENT 'Reference to tb_karyawan.id',
  `method_type`          ENUM('nip', 'pin', 'rfid', 'face_id', 'custom') NOT NULL COMMENT 'Identifier channel type',
  `method_value`         VARCHAR(191) NOT NULL COMMENT 'Identifier value used by channel',
  `is_primary`           TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1 when this method is preferred for that type',
  `is_verified`          TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1 when validated by trusted process',
  `source_system`        VARCHAR(64)  NOT NULL DEFAULT 'migration_v3' COMMENT 'Source marker for reconciliation',
  `metadata_json`        JSON         NULL COMMENT 'Extra identification metadata (issuer/device/reference)',
  `valid_from`           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Method validity start',
  `valid_to`             DATETIME     NULL COMMENT 'Method validity end; NULL means active',
  `created_at`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cs_ident_method_employee_type_value` (`employee_id`, `method_type`, `method_value`),
  KEY `idx_cs_ident_method_lookup` (`method_type`, `method_value`),
  KEY `idx_cs_ident_method_employee_primary` (`employee_id`, `is_primary`),
  CONSTRAINT `fk_cs_ident_method_employee`
    FOREIGN KEY (`employee_id`) REFERENCES `tb_karyawan`(`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_cs_ident_method_valid_range`
    CHECK (`valid_to` IS NULL OR `valid_to` >= `valid_from`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Employee identification metadata contract (NIP/PIN/RFID/Face/custom)';

-- ------------------------------------------------------------
-- 3) Canonical role-policy catalog
--    Exactly three canonical tiers are stored here.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cs_role_policy_catalog` (
  `role_key`             ENUM('admin', 'group_leader', 'employee') NOT NULL,
  `description`          VARCHAR(255) NULL,
  `policy_json`          JSON         NOT NULL COMMENT 'Role capability contract payload',
  `created_at`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Canonical 3-tier role-policy definitions';

-- Seed/refresh canonical policy definitions (idempotent).
INSERT INTO `cs_role_policy_catalog` (`role_key`, `description`, `policy_json`)
VALUES
  (
    'admin',
    'Global administrator with full access',
    JSON_OBJECT(
      'can_access_admin', TRUE,
      'can_manage_users', TRUE,
      'can_manage_groups', TRUE,
      'can_manage_schedule', TRUE,
      'can_view_dashboard', TRUE,
      'can_access_raw_scanlog', TRUE
    )
  ),
  (
    'group_leader',
    'Group-scoped manager for schedule and dashboard operations',
    JSON_OBJECT(
      'can_access_admin', FALSE,
      'can_manage_users', FALSE,
      'can_manage_groups', FALSE,
      'can_manage_schedule', TRUE,
      'can_view_dashboard', TRUE,
      'can_access_raw_scanlog', FALSE
    )
  ),
  (
    'employee',
    'Standard employee with dashboard-level visibility',
    JSON_OBJECT(
      'can_access_admin', FALSE,
      'can_manage_users', FALSE,
      'can_manage_groups', FALSE,
      'can_manage_schedule', FALSE,
      'can_view_dashboard', TRUE,
      'can_access_raw_scanlog', FALSE
    )
  )
ON DUPLICATE KEY UPDATE
  `description` = VALUES(`description`),
  `policy_json` = VALUES(`policy_json`),
  `updated_at` = CURRENT_TIMESTAMP;

-- ------------------------------------------------------------
-- 4) Employee role bindings (canonical policy assignment)
--    Supports global and group-scoped role grants.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cs_employee_role_bindings` (
  `id`                   BIGINT       NOT NULL AUTO_INCREMENT,
  `employee_id`          INT(11)      NOT NULL COMMENT 'Role subject (tb_karyawan.id)',
  `role_key`             ENUM('admin', 'group_leader', 'employee') NOT NULL COMMENT 'Canonical role tier',
  `scope_type`           ENUM('global', 'group') NOT NULL DEFAULT 'global' COMMENT 'Scope for role grant',
  `scope_group_id`       INT(11)      NULL COMMENT 'Required only for group-scoped grants',
  `granted_by_employee_id` INT(11)    NULL COMMENT 'Actor that granted the role',
  `grant_source`         VARCHAR(64)  NOT NULL DEFAULT 'migration_v3' COMMENT 'Source marker for migration/reconciliation',
  `starts_at`            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ends_at`              DATETIME     NULL,
  `is_active`            TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cs_role_binding_unique_scope` (`employee_id`, `role_key`, `scope_type`, `scope_group_id`, `starts_at`),
  KEY `idx_cs_role_binding_employee_active` (`employee_id`, `is_active`),
  KEY `idx_cs_role_binding_scope_group` (`scope_group_id`, `role_key`, `is_active`),
  CONSTRAINT `fk_cs_role_binding_employee`
    FOREIGN KEY (`employee_id`) REFERENCES `tb_karyawan`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cs_role_binding_role`
    FOREIGN KEY (`role_key`) REFERENCES `cs_role_policy_catalog`(`role_key`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cs_role_binding_scope_group`
    FOREIGN KEY (`scope_group_id`) REFERENCES `tb_group`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cs_role_binding_granted_by`
    FOREIGN KEY (`granted_by_employee_id`) REFERENCES `tb_karyawan`(`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_cs_role_binding_scope_valid`
    CHECK ((`scope_type` = 'global' AND `scope_group_id` IS NULL) OR (`scope_type` = 'group' AND `scope_group_id` IS NOT NULL)),
  CONSTRAINT `chk_cs_role_binding_admin_scope`
    CHECK (NOT (`role_key` = 'admin' AND `scope_type` = 'group')),
  CONSTRAINT `chk_cs_role_binding_time_window`
    CHECK (`ends_at` IS NULL OR `ends_at` >= `starts_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Canonical employee role grants aligned to admin/group_leader/employee';

-- ------------------------------------------------------------
-- 5) Group ownership contract
--    Explicit owner records for leader-bound group stewardship.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cs_group_ownership` (
  `id`                   BIGINT       NOT NULL AUTO_INCREMENT,
  `group_id`             INT(11)      NOT NULL COMMENT 'Owned group (tb_group.id)',
  `owner_employee_id`    INT(11)      NOT NULL COMMENT 'Leader employee (tb_karyawan.id)',
  `ownership_role`       ENUM('group_leader') NOT NULL DEFAULT 'group_leader',
  `assigned_by_employee_id` INT(11)   NULL,
  `starts_at`            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ends_at`              DATETIME     NULL,
  `is_primary`           TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cs_group_ownership_window` (`group_id`, `owner_employee_id`, `starts_at`),
  KEY `idx_cs_group_ownership_active_lookup` (`group_id`, `is_primary`, `ends_at`),
  CONSTRAINT `fk_cs_group_ownership_group`
    FOREIGN KEY (`group_id`) REFERENCES `tb_group`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cs_group_ownership_owner`
    FOREIGN KEY (`owner_employee_id`) REFERENCES `tb_karyawan`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cs_group_ownership_assigned_by`
    FOREIGN KEY (`assigned_by_employee_id`) REFERENCES `tb_karyawan`(`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_cs_group_ownership_time_window`
    CHECK (`ends_at` IS NULL OR `ends_at` >= `starts_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Group ownership history contract for leader stewardship';

-- ------------------------------------------------------------
-- 6) Raw/computed scanlog separation contracts
-- ------------------------------------------------------------

-- Raw immutable scanlog events (clean-slate source table)
CREATE TABLE IF NOT EXISTS `cs_scanlog_raw_events` (
  `id`                   BIGINT       NOT NULL AUTO_INCREMENT,
  `source_event_key`     VARCHAR(191) NOT NULL COMMENT 'Deduplication key from source payload',
  `device_sn`            VARCHAR(64)  NOT NULL COMMENT 'Source device serial number',
  `employee_pin`         VARCHAR(32)  NOT NULL COMMENT 'Machine pin observed in raw event',
  `event_at`             DATETIME     NOT NULL COMMENT 'Original event timestamp',
  `verify_mode`          INT          NULL,
  `io_mode`              INT          NULL,
  `workcode`             VARCHAR(32)  NULL,
  `payload_json`         JSON         NULL COMMENT 'Raw machine payload snapshot',
  `ingested_from`        ENUM('machine_sync', 'manual_import', 'compat_backfill') NOT NULL DEFAULT 'compat_backfill',
  `batch_ref`            BIGINT       NULL COMMENT 'Optional external batch reference',
  `ingested_at`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cs_scanlog_raw_source_event` (`source_event_key`),
  KEY `idx_cs_scanlog_raw_device_time` (`device_sn`, `event_at`),
  KEY `idx_cs_scanlog_raw_pin_time` (`employee_pin`, `event_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Canonical immutable raw scanlog stream';

-- Computed daily attendance output (derived/read model contract)
CREATE TABLE IF NOT EXISTS `cs_attendance_daily_computed` (
  `id`                   BIGINT       NOT NULL AUTO_INCREMENT,
  `employee_id`          INT(11)      NOT NULL,
  `work_date`            DATE         NOT NULL,
  `first_in`             TIME         NULL,
  `last_out`             TIME         NULL,
  `scan_count`           INT          NOT NULL DEFAULT 0,
  `late_minutes`         INT          NOT NULL DEFAULT 0,
  `early_leave_minutes`  INT          NOT NULL DEFAULT 0,
  `computed_status`      ENUM('normal', 'terlambat', 'pulang_awal', 'tidak_hadir', 'reviewed', 'lainnya') NOT NULL DEFAULT 'normal',
  `computation_source`   ENUM('rule_engine_v3', 'manual_override', 'compat_shadow') NOT NULL DEFAULT 'compat_shadow',
  `source_version`       VARCHAR(32)  NOT NULL DEFAULT 'v3-contract',
  `updated_by_employee_id` INT(11)    NULL,
  `updated_at`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cs_attendance_daily_employee_date` (`employee_id`, `work_date`),
  KEY `idx_cs_attendance_daily_date_status` (`work_date`, `computed_status`),
  CONSTRAINT `fk_cs_attendance_daily_employee`
    FOREIGN KEY (`employee_id`) REFERENCES `tb_karyawan`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cs_attendance_daily_updated_by`
    FOREIGN KEY (`updated_by_employee_id`) REFERENCES `tb_karyawan`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Computed attendance daily read-model separated from raw scanlog';

-- ------------------------------------------------------------
-- 7) Monthly prediction target source model
--    Priority rule: group override -> global fallback.
-- ------------------------------------------------------------

-- Global baseline target per month.
CREATE TABLE IF NOT EXISTS `cs_monthly_prediction_target_global` (
  `year_month`           CHAR(7)      NOT NULL COMMENT 'Format: YYYY-MM',
  `minimum_hours`        DECIMAL(6,2) NOT NULL COMMENT 'Baseline target hours for the month',
  `source_label`         VARCHAR(64)  NOT NULL DEFAULT 'global_default',
  `note`                 TEXT         NULL,
  `is_active`            TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`year_month`),
  CONSTRAINT `chk_cs_monthly_prediction_global_hours`
    CHECK (`minimum_hours` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Global monthly prediction target baseline';

-- Group-level override target per month.
CREATE TABLE IF NOT EXISTS `cs_monthly_prediction_target_group_override` (
  `id`                   BIGINT       NOT NULL AUTO_INCREMENT,
  `year_month`           CHAR(7)      NOT NULL COMMENT 'Format: YYYY-MM',
  `group_id`             INT(11)      NOT NULL,
  `minimum_hours`        DECIMAL(6,2) NOT NULL COMMENT 'Group-specific target hours for the month',
  `source_label`         VARCHAR(64)  NOT NULL DEFAULT 'group_override',
  `note`                 TEXT         NULL,
  `is_active`            TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cs_monthly_prediction_group_override` (`year_month`, `group_id`),
  KEY `idx_cs_monthly_prediction_group_lookup` (`group_id`, `year_month`, `is_active`),
  CONSTRAINT `fk_cs_monthly_prediction_group`
    FOREIGN KEY (`group_id`) REFERENCES `tb_group`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cs_monthly_prediction_global_month`
    FOREIGN KEY (`year_month`) REFERENCES `cs_monthly_prediction_target_global`(`year_month`) ON DELETE CASCADE,
  CONSTRAINT `chk_cs_monthly_prediction_group_hours`
    CHECK (`minimum_hours` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Group-level monthly prediction target override';

-- ------------------------------------------------------------
-- 8) Compatibility mapping table for legacy role labels
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cs_legacy_role_alias_map` (
  `legacy_role_key`      VARCHAR(40)  NOT NULL,
  `canonical_role_key`   ENUM('admin', 'group_leader', 'employee') NOT NULL,
  `is_default_projection` TINYINT(1)  NOT NULL DEFAULT 0 COMMENT '1 when this alias is emitted in default compatibility view',
  `is_transitional`      TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '1 means alias is transitional/deprecated',
  `notes`                VARCHAR(255) NULL,
  `created_at`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`legacy_role_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Legacy role label to canonical role mapping bridge';

-- Seed/refresh role alias map (idempotent).
INSERT INTO `cs_legacy_role_alias_map`
(`legacy_role_key`, `canonical_role_key`, `is_default_projection`, `is_transitional`, `notes`)
VALUES
  ('admin',        'admin',        1, 0, 'Canonical admin projection'),
  ('group_leader', 'group_leader', 1, 0, 'Canonical leader projection'),
  ('viewer',       'employee',     1, 1, 'Legacy default projection for employee-grade access'),
  ('leader',       'group_leader', 0, 1, 'Deprecated alias retained for bridge compatibility'),
  ('scheduler',    'group_leader', 0, 1, 'Deprecated alias retained for bridge compatibility'),
  ('hr',           'group_leader', 0, 1, 'Transitional alias retained for schedule-revision compatibility'),
  ('employee',     'employee',     0, 1, 'Explicit employee alias retained for bridge tooling')
ON DUPLICATE KEY UPDATE
  `canonical_role_key` = VALUES(`canonical_role_key`),
  `is_default_projection` = VALUES(`is_default_projection`),
  `is_transitional` = VALUES(`is_transitional`),
  `notes` = VALUES(`notes`),
  `updated_at` = CURRENT_TIMESTAMP;

-- ------------------------------------------------------------
-- 9) Compatibility bridge views (non-destructive)
-- ------------------------------------------------------------

-- Bridge view for legacy tb_karyawan_auth-like contract.
DROP VIEW IF EXISTS `vw_compat_karyawan_auth`;
CREATE VIEW `vw_compat_karyawan_auth` AS
SELECT
  ai.employee_id AS `karyawan_id`,
  ai.login_nip AS `nip`,
  ai.password_hash AS `password_hash`,
  CASE WHEN ai.identity_status = 'active' THEN 1 ELSE 0 END AS `is_active`,
  ai.last_login_at AS `last_login_at`,
  ai.created_at AS `created_at`,
  ai.updated_at AS `updated_at`
FROM `cs_employee_auth_identity` ai;

-- Bridge view for legacy tb_karyawan_roles-like contract.
DROP VIEW IF EXISTS `vw_compat_karyawan_roles`;
CREATE VIEW `vw_compat_karyawan_roles` AS
SELECT
  CAST(NULL AS SIGNED) AS `id`,
  rb.employee_id AS `karyawan_id`,
  map.legacy_role_key AS `role_key`,
  CASE WHEN rb.scope_type = 'group' THEN rb.scope_group_id ELSE NULL END AS `group_id`,
  rb.created_at AS `created_at`
FROM `cs_employee_role_bindings` rb
JOIN `cs_legacy_role_alias_map` map
  ON map.canonical_role_key = rb.role_key
 AND map.is_default_projection = 1
WHERE rb.is_active = 1
  AND (rb.ends_at IS NULL OR rb.ends_at >= NOW());

-- Bridge view for legacy tb_user_group_access-like contract.
DROP VIEW IF EXISTS `vw_compat_user_group_access`;
CREATE VIEW `vw_compat_user_group_access` AS
SELECT
  CAST(NULL AS SIGNED) AS `id`,
  k.pin AS `pin`,
  rb.scope_group_id AS `group_id`,
  CASE WHEN rb.role_key = 'group_leader' THEN 1 ELSE 0 END AS `can_schedule`,
  1 AS `can_dashboard`,
  CASE WHEN rb.role_key = 'group_leader' THEN 1 ELSE 0 END AS `is_leader`,
  1 AS `is_approved`,
  CAST(NULL AS CHAR(12)) AS `approved_by`,
  rb.created_at AS `approved_at`,
  rb.created_at AS `created_at`
FROM `cs_employee_role_bindings` rb
JOIN `tb_karyawan` k
  ON k.id = rb.employee_id
WHERE rb.scope_type = 'group'
  AND rb.is_active = 1
  AND (rb.ends_at IS NULL OR rb.ends_at >= NOW());

-- Bridge view from canonical raw events to legacy-safe event shape.
DROP VIEW IF EXISTS `vw_compat_scanlog_safe_events`;
CREATE VIEW `vw_compat_scanlog_safe_events` AS
SELECT
  re.id AS `id`,
  re.source_event_key AS `source_event_key`,
  'clean_slate_v3' AS `source_sdk`,
  re.device_sn AS `sn`,
  re.employee_pin AS `pin`,
  re.event_at AS `scan_at`,
  DATE(re.event_at) AS `scan_date`,
  TIME(re.event_at) AS `scan_time`,
  re.verify_mode AS `verifymode`,
  re.io_mode AS `iomode`,
  re.workcode AS `workcode`,
  re.payload_json AS `raw_payload`,
  re.batch_ref AS `batch_id`,
  re.ingested_at AS `imported_at`
FROM `cs_scanlog_raw_events` re;

-- Effective monthly prediction target view:
-- group override -> global fallback.
DROP VIEW IF EXISTS `vw_prediction_target_effective`;
CREATE VIEW `vw_prediction_target_effective` AS
SELECT
  global_cfg.year_month AS `year_month`,
  grp.id AS `group_id`,
  grp.nama_group AS `nama_group`,
  COALESCE(group_cfg.minimum_hours, global_cfg.minimum_hours) AS `minimum_hours`,
  CASE WHEN group_cfg.id IS NULL THEN 'global_fallback' ELSE 'group_override' END AS `target_source`,
  global_cfg.minimum_hours AS `global_minimum_hours`,
  group_cfg.minimum_hours AS `group_override_hours`
FROM `cs_monthly_prediction_target_global` global_cfg
JOIN `tb_group` grp ON 1 = 1
LEFT JOIN `cs_monthly_prediction_target_group_override` group_cfg
  ON group_cfg.year_month = global_cfg.year_month
 AND group_cfg.group_id = grp.id
 AND group_cfg.is_active = 1
WHERE global_cfg.is_active = 1

UNION ALL

SELECT
  global_cfg.year_month AS `year_month`,
  NULL AS `group_id`,
  NULL AS `nama_group`,
  global_cfg.minimum_hours AS `minimum_hours`,
  'global_default' AS `target_source`,
  global_cfg.minimum_hours AS `global_minimum_hours`,
  NULL AS `group_override_hours`
FROM `cs_monthly_prediction_target_global` global_cfg
WHERE global_cfg.is_active = 1;

-- ============================================================
-- END OF V3 CLEAN-SLATE SCHEMA CONTRACT MIGRATION
-- ============================================================
