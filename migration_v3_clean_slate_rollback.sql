-- ============================================================
-- V3 CLEAN-SLATE SCHEMA ROLLBACK (REVERSIBLE ONLY)
-- Purpose:
--   Remove additive v3 clean-slate objects created by
--   migration_v3_clean_slate_schema.sql without touching legacy tables.
--
-- IMPORTANT:
--   - This rollback intentionally does NOT drop legacy tables.
--   - Execute only after validating downstream dependencies.
-- ============================================================

USE `demo_easylinksdk`;

-- ------------------------------------------------------------
-- 1) Drop compatibility views first (depend on v3 tables)
-- ------------------------------------------------------------
DROP VIEW IF EXISTS `vw_prediction_target_effective`;
DROP VIEW IF EXISTS `vw_compat_scanlog_safe_events`;
DROP VIEW IF EXISTS `vw_compat_user_group_access`;
DROP VIEW IF EXISTS `vw_compat_karyawan_roles`;
DROP VIEW IF EXISTS `vw_compat_karyawan_auth`;

-- ------------------------------------------------------------
-- 2) Drop v3 tables in dependency-safe reverse order
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `cs_monthly_prediction_target_group_override`;
DROP TABLE IF EXISTS `cs_monthly_prediction_target_global`;

DROP TABLE IF EXISTS `cs_attendance_daily_computed`;
DROP TABLE IF EXISTS `cs_scanlog_raw_events`;

DROP TABLE IF EXISTS `cs_group_ownership`;

DROP TABLE IF EXISTS `cs_employee_role_bindings`;
DROP TABLE IF EXISTS `cs_role_policy_catalog`;
DROP TABLE IF EXISTS `cs_legacy_role_alias_map`;

DROP TABLE IF EXISTS `cs_employee_identification_methods`;
DROP TABLE IF EXISTS `cs_employee_auth_identity`;

-- ============================================================
-- END OF V3 CLEAN-SLATE ROLLBACK
-- ============================================================
