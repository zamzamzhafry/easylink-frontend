-- Rollback for Task 4 (M1) enum narrow
-- Restores enum to 5 values and converts employee back to viewer
--
-- Applied: 2026-06-23 (rollback)

-- Step 1: Widen the enum back to 5 values
ALTER TABLE tb_karyawan_roles
MODIFY COLUMN role_key enum('admin','hr','group_leader','scheduler','viewer') COLLATE utf8mb4_general_ci NOT NULL;

-- Step 2: Convert employee back to viewer (only kar10008 was converted)
UPDATE tb_karyawan_roles
SET role_key = 'viewer'
WHERE karyawan_id = 10008 AND role_key = 'employee';
