-- ============================================================
-- TASK 11 (H4): GROUP-LEADER RE-ANCHOR BACKFILL — ADDITIVE ONLY
-- Purpose:
--   Re-anchor group-leader source-of-truth from the legacy,
--   pin-keyed device table `tb_user_group_access.is_leader` onto
--   the karyawan_id-keyed `tb_karyawan_roles` table
--   (role_key='group_leader', group_id=N).
--
--   For every existing `tb_user_group_access.is_leader = 1` row,
--   insert a matching `tb_karyawan_roles(karyawan_id,'group_leader',
--   group_id)` row IF one does not already exist. The legacy device
--   table is LEFT UNTOUCHED (machine/device keeps writing is_leader
--   there as dead data, per the re-anchor plan).
--
-- IMPORTANT:
--   - Does NOT drop, alter, or mutate any legacy table.
--   - Does NOT alter the tb_karyawan_roles ENUM (M1/T4 blocked).
--   - Multi-leader per group is allowed: multiple
--     (karyawan_id,'group_leader',group_id) rows for one group_id.
--   - pin -> karyawan_id resolved via tb_karyawan.pin JOIN.
--   - Idempotent: INSERT ... SELECT ... WHERE NOT EXISTS, safe re-run.
-- ============================================================

USE `demo_easylinksdk`;

INSERT INTO `tb_karyawan_roles` (`karyawan_id`, `role_key`, `group_id`)
SELECT k.id, 'group_leader', uga.group_id
FROM `tb_user_group_access` uga
JOIN `tb_karyawan` k ON k.pin = uga.pin
WHERE uga.is_leader = 1
  AND NOT EXISTS (
    SELECT 1
    FROM `tb_karyawan_roles` r
    WHERE r.karyawan_id = k.id
      AND r.role_key = 'group_leader'
      AND r.group_id = uga.group_id
  );
