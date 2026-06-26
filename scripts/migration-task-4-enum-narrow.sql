-- Task 4 (M1): Narrow tb_karyawan_roles.role_key enum from 5 to 3 values
-- Current: ('admin','hr','group_leader','scheduler','viewer')
-- Target:  ('admin','group_leader','employee')
--
-- ROLLBACK: scripts/migration-task-4-enum-narrow-rollback.sql
--
-- Pre-flight verified: 0 hr rows, 0 scheduler rows, 1 viewer row (id=5, kar10008)
--
-- Step 1: Convert viewer → employee (the only non-admin/group_leader row)
-- Step 2: ALTER ENUM to remove hr/scheduler/viewer
--
-- Applied: 2026-06-23

-- Step 1: Convert viewer to employee
UPDATE tb_karyawan_roles
SET role_key = 'employee'
WHERE role_key = 'viewer';

-- Step 2: Narrow the enum
ALTER TABLE tb_karyawan_roles
MODIFY COLUMN role_key enum('admin','group_leader','employee') COLLATE utf8mb4_general_ci NOT NULL;
