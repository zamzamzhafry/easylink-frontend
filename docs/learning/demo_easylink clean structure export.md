-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Waktu pembuatan: 29 Mar 2026 pada 10.25
-- Versi server: 10.4.32-MariaDB
-- Versi PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/_!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT _/;
/_!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS _/;
/_!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION _/;
/_!40101 SET NAMES utf8mb4 _/;

--
-- Database: `demo_easylinksdk`
--

---

--
-- Struktur dari tabel `cs_attendance_daily_computed`
--

CREATE TABLE `cs_attendance_daily_computed` (
`id` bigint(20) NOT NULL,
`employee_id` int(11) NOT NULL,
`work_date` date NOT NULL,
`first_in` time DEFAULT NULL,
`last_out` time DEFAULT NULL,
`scan_count` int(11) NOT NULL DEFAULT 0,
`late_minutes` int(11) NOT NULL DEFAULT 0,
`early_leave_minutes` int(11) NOT NULL DEFAULT 0,
`computed_status` enum('normal','terlambat','pulang_awal','tidak_hadir','reviewed','lainnya') NOT NULL DEFAULT 'normal',
`computation_source` enum('rule_engine_v3','manual_override','compat_shadow') NOT NULL DEFAULT 'compat_shadow',
`source_version` varchar(32) NOT NULL DEFAULT 'v3-contract',
`updated_by_employee_id` int(11) DEFAULT NULL,
`updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Computed attendance daily read-model separated from raw scanlog';

---

--
-- Struktur dari tabel `cs_employee_auth_identity`
--

CREATE TABLE `cs_employee_auth_identity` (
`employee_id` int(11) NOT NULL COMMENT '1:1 reference to tb_karyawan.id',
`login_nip` varchar(50) NOT NULL COMMENT 'Canonical app-login identifier (NIP)',
`password_hash` varchar(255) NOT NULL COMMENT 'Credential hash for application login',
`identity_status` enum('active','disabled','locked') NOT NULL DEFAULT 'active' COMMENT 'Auth account status',
`password_updated_at` datetime DEFAULT NULL COMMENT 'Last password update timestamp',
`last_login_at` datetime DEFAULT NULL COMMENT 'Last successful login timestamp',
`created_at` timestamp NOT NULL DEFAULT current_timestamp(),
`updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Canonical employee-bound auth identity contract (1 employee : 1 auth account)';

---

--
-- Struktur dari tabel `cs_employee_identification_methods`
--

CREATE TABLE `cs_employee_identification_methods` (
`id` bigint(20) NOT NULL,
`employee_id` int(11) NOT NULL COMMENT 'Reference to tb_karyawan.id',
`method_type` enum('nip','pin','rfid','face_id','custom') NOT NULL COMMENT 'Identifier channel type',
`method_value` varchar(191) NOT NULL COMMENT 'Identifier value used by channel',
`is_primary` tinyint(1) NOT NULL DEFAULT 0 COMMENT '1 when this method is preferred for that type',
`is_verified` tinyint(1) NOT NULL DEFAULT 0 COMMENT '1 when validated by trusted process',
`source_system` varchar(64) NOT NULL DEFAULT 'migration_v3' COMMENT 'Source marker for reconciliation',
`metadata_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Extra identification metadata (issuer/device/reference)' CHECK (json_valid(`metadata_json`)),
`valid_from` datetime NOT NULL DEFAULT current_timestamp() COMMENT 'Method validity start',
`valid_to` datetime DEFAULT NULL COMMENT 'Method validity end; NULL means active',
`created_at` timestamp NOT NULL DEFAULT current_timestamp(),
`updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

---

--
-- Struktur dari tabel `cs_employee_role_bindings`
--

CREATE TABLE `cs_employee_role_bindings` (
`id` bigint(20) NOT NULL,
`employee_id` int(11) NOT NULL COMMENT 'Role subject (tb_karyawan.id)',
`role_key` enum('admin','group_leader','employee') NOT NULL COMMENT 'Canonical role tier',
`scope_type` enum('global','group') NOT NULL DEFAULT 'global' COMMENT 'Scope for role grant',
`scope_group_id` int(11) DEFAULT NULL COMMENT 'Required only for group-scoped grants',
`granted_by_employee_id` int(11) DEFAULT NULL COMMENT 'Actor that granted the role',
`grant_source` varchar(64) NOT NULL DEFAULT 'migration_v3' COMMENT 'Source marker for migration/reconciliation',
`starts_at` datetime NOT NULL DEFAULT current_timestamp(),
`ends_at` datetime DEFAULT NULL,
`is_active` tinyint(1) NOT NULL DEFAULT 1,
`created_at` timestamp NOT NULL DEFAULT current_timestamp(),
`updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

---

--
-- Struktur dari tabel `cs_group_ownership`
--

CREATE TABLE `cs_group_ownership` (
`id` bigint(20) NOT NULL,
`group_id` int(11) NOT NULL COMMENT 'Owned group (tb_group.id)',
`owner_employee_id` int(11) NOT NULL COMMENT 'Leader employee (tb_karyawan.id)',
`ownership_role` enum('group_leader') NOT NULL DEFAULT 'group_leader',
`assigned_by_employee_id` int(11) DEFAULT NULL,
`starts_at` datetime NOT NULL DEFAULT current_timestamp(),
`ends_at` datetime DEFAULT NULL,
`is_primary` tinyint(1) NOT NULL DEFAULT 1,
`created_at` timestamp NOT NULL DEFAULT current_timestamp(),
`updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

---

--
-- Struktur dari tabel `cs_legacy_role_alias_map`
--

CREATE TABLE `cs_legacy_role_alias_map` (
`legacy_role_key` varchar(40) NOT NULL,
`canonical_role_key` enum('admin','group_leader','employee') NOT NULL,
`is_default_projection` tinyint(1) NOT NULL DEFAULT 0 COMMENT '1 when this alias is emitted in default compatibility view',
`is_transitional` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1 means alias is transitional/deprecated',
`notes` varchar(255) DEFAULT NULL,
`created_at` timestamp NOT NULL DEFAULT current_timestamp(),
`updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Legacy role label to canonical role mapping bridge';

---

--
-- Struktur dari tabel `cs_monthly_prediction_target_global`
--

CREATE TABLE `cs_monthly_prediction_target_global` (
`year_month` char(7) NOT NULL COMMENT 'Format: YYYY-MM',
`minimum_hours` decimal(6,2) NOT NULL COMMENT 'Baseline target hours for the month',
`source_label` varchar(64) NOT NULL DEFAULT 'global_default',
`note` text DEFAULT NULL,
`is_active` tinyint(1) NOT NULL DEFAULT 1,
`created_at` timestamp NOT NULL DEFAULT current_timestamp(),
`updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

---

--
-- Struktur dari tabel `cs_monthly_prediction_target_group_override`
--

CREATE TABLE `cs_monthly_prediction_target_group_override` (
`id` bigint(20) NOT NULL,
`year_month` char(7) NOT NULL COMMENT 'Format: YYYY-MM',
`group_id` int(11) NOT NULL,
`minimum_hours` decimal(6,2) NOT NULL COMMENT 'Group-specific target hours for the month',
`source_label` varchar(64) NOT NULL DEFAULT 'group_override',
`note` text DEFAULT NULL,
`is_active` tinyint(1) NOT NULL DEFAULT 1,
`created_at` timestamp NOT NULL DEFAULT current_timestamp(),
`updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

---

--
-- Struktur dari tabel `cs_role_policy_catalog`
--

CREATE TABLE `cs_role_policy_catalog` (
`role_key` enum('admin','group_leader','employee') NOT NULL,
`description` varchar(255) DEFAULT NULL,
`policy_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'Role capability contract payload' CHECK (json_valid(`policy_json`)),
`created_at` timestamp NOT NULL DEFAULT current_timestamp(),
`updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Canonical 3-tier role-policy definitions';

---

--
-- Struktur dari tabel `cs_scanlog_raw_events`
--

CREATE TABLE `cs_scanlog_raw_events` (
`id` bigint(20) NOT NULL,
`source_event_key` varchar(191) NOT NULL COMMENT 'Deduplication key from source payload',
`device_sn` varchar(64) NOT NULL COMMENT 'Source device serial number',
`employee_pin` varchar(32) NOT NULL COMMENT 'Machine pin observed in raw event',
`event_at` datetime NOT NULL COMMENT 'Original event timestamp',
`verify_mode` int(11) DEFAULT NULL,
`io_mode` int(11) DEFAULT NULL,
`workcode` varchar(32) DEFAULT NULL,
`payload_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Raw machine payload snapshot' CHECK (json_valid(`payload_json`)),
`ingested_from` enum('machine_sync','manual_import','compat_backfill') NOT NULL DEFAULT 'compat_backfill',
`batch_ref` bigint(20) DEFAULT NULL COMMENT 'Optional external batch reference',
`ingested_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Canonical immutable raw scanlog stream';

---

--
-- Struktur dari tabel `employees`
--

CREATE TABLE `employees` (
`id` bigint(20) NOT NULL,
`employee_code` varchar(32) NOT NULL,
`full_name` varchar(120) NOT NULL,
`is_active` tinyint(1) NOT NULL DEFAULT 1,
`created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

---

--
-- Struktur dari tabel `employee_auth_accounts`
--

CREATE TABLE `employee_auth_accounts` (
`id` bigint(20) NOT NULL,
`employee_id` bigint(20) NOT NULL,
`username` varchar(64) NOT NULL,
`password_hash` varchar(255) NOT NULL,
`is_locked` tinyint(1) NOT NULL DEFAULT 0,
`created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

---

--
-- Struktur dari tabel `employee_machine_identity`
--

CREATE TABLE `employee_machine_identity` (
`id` bigint(20) NOT NULL,
`employee_id` bigint(20) NOT NULL,
`device_sn` varchar(64) NOT NULL,
`pin` varchar(32) NOT NULL,
`valid_from` date NOT NULL,
`valid_to` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

---

--
-- Struktur dari tabel `scanlog_events`
--

CREATE TABLE `scanlog_events` (
`id` bigint(20) NOT NULL,
`source_event_key` varchar(191) NOT NULL,
`device_sn` varchar(64) NOT NULL,
`event_time` datetime NOT NULL,
`pin_raw` varchar(32) NOT NULL,
`verify_mode` int(11) DEFAULT NULL,
`io_mode` int(11) DEFAULT NULL,
`workcode` varchar(32) DEFAULT NULL,
`payload_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`payload_json`)),
`ingested_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

---

--
-- Struktur dari tabel `tb_attendance_note`
--

CREATE TABLE `tb_attendance_note` (
`id` int(11) NOT NULL,
`pin` varchar(12) NOT NULL,
`tanggal` date NOT NULL,
`status` enum('normal','terlambat','pulang_awal','tidak_hadir','lembur','lainnya') NOT NULL DEFAULT 'normal',
`catatan` text DEFAULT NULL,
`updated_by` varchar(100) DEFAULT NULL,
`updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

---

--
-- Struktur dari tabel `tb_device`
--

CREATE TABLE `tb_device` (
`No` int(11) NOT NULL,
`server_IP` text NOT NULL,
`server_port` text NOT NULL,
`device_sn` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

---

--
-- Struktur dari tabel `tb_employee_group`
--

CREATE TABLE `tb_employee_group` (
`karyawan_id` int(11) NOT NULL,
`group_id` int(11) NOT NULL,
`assigned_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

---

--
-- Struktur dari tabel `tb_group`
--

CREATE TABLE `tb_group` (
`id` int(11) NOT NULL,
`nama_group` varchar(100) NOT NULL,
`deskripsi` text DEFAULT NULL,
`created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

---

--
-- Struktur dari tabel `tb_group_schedule`
--

CREATE TABLE `tb_group_schedule` (
`id` int(11) NOT NULL,
`group_id` int(11) NOT NULL,
`tanggal_awal` date NOT NULL,
`tanggal_akhir` date NOT NULL,
`shift_id` int(11) NOT NULL,
`created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

---

--
-- Struktur dari tabel `tb_karyawan`
--

CREATE TABLE `tb_karyawan` (
`id` int(11) NOT NULL,
`nama` text DEFAULT NULL,
`pin` text DEFAULT NULL,
`awal_kontrak` text DEFAULT NULL,
`akhir_kontrak` text DEFAULT NULL,
`nip` text DEFAULT NULL,
`foto` text DEFAULT NULL,
`isDeleted` tinyint(1) NOT NULL DEFAULT 0,
`deletedAt` datetime DEFAULT NULL,
`isActiveDuty` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

---

--
-- Struktur dari tabel `tb_karyawan_auth`
--

CREATE TABLE `tb_karyawan_auth` (
`karyawan_id` int(11) NOT NULL,
`nip` varchar(50) NOT NULL,
`password_hash` varchar(255) NOT NULL,
`is_active` tinyint(1) DEFAULT 1,
`last_login_at` timestamp NULL DEFAULT NULL,
`created_at` timestamp NOT NULL DEFAULT current_timestamp(),
`updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

---

--
-- Struktur dari tabel `tb_karyawan_roles`
--

CREATE TABLE `tb_karyawan_roles` (
`id` int(11) NOT NULL,
`karyawan_id` int(11) NOT NULL,
`role_key` enum('admin','hr','group_leader','scheduler','viewer') NOT NULL,
`group_id` int(11) DEFAULT NULL,
`created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

---

--
-- Struktur dari tabel `tb_scanlog`
--

CREATE TABLE `tb_scanlog` (
`sn` varchar(50) NOT NULL,
`pin` varchar(12) NOT NULL,
`scan_date` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
`verifymode` int(11) NOT NULL,
`iomode` int(11) NOT NULL,
`workcode` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

---

--
-- Struktur dari tabel `tb_scanlog_hidden`
--

CREATE TABLE `tb_scanlog_hidden` (
`id` int(11) NOT NULL,
`pin` varchar(12) NOT NULL,
`scan_at` datetime NOT NULL,
`sn` varchar(100) DEFAULT '',
`iomode` int(11) NOT NULL DEFAULT 0,
`workcode` int(11) NOT NULL DEFAULT 0,
`reason` varchar(255) DEFAULT NULL,
`hidden_by` varchar(12) DEFAULT NULL,
`is_active` tinyint(1) NOT NULL DEFAULT 1,
`hidden_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

---

--
-- Struktur dari tabel `tb_scanlog_review_mutation_audit`
--

CREATE TABLE `tb_scanlog_review_mutation_audit` (
`id` bigint(20) UNSIGNED NOT NULL,
`action` varchar(32) NOT NULL,
`pin` varchar(32) NOT NULL,
`scan_at` datetime NOT NULL,
`sn` varchar(64) NOT NULL,
`iomode` int(11) NOT NULL,
`workcode` int(11) NOT NULL,
`tag_status` enum('late','acceptable','invalid') DEFAULT NULL,
`note` varchar(255) DEFAULT NULL,
`reason` varchar(255) DEFAULT NULL,
`actor_pin` varchar(32) NOT NULL,
`acted_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

---

--
-- Struktur dari tabel `tb_scanlog_review_tag`
--

CREATE TABLE `tb_scanlog_review_tag` (
`pin` varchar(32) NOT NULL,
`scan_at` datetime NOT NULL,
`sn` varchar(64) NOT NULL,
`iomode` int(11) NOT NULL,
`workcode` int(11) NOT NULL,
`status` enum('late','acceptable','invalid') NOT NULL,
`note` varchar(255) DEFAULT NULL,
`tagged_by` varchar(32) NOT NULL,
`tagged_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

---

--
-- Struktur dari tabel `tb_scanlog_safe_batches`
--

CREATE TABLE `tb_scanlog_safe_batches` (
`id` bigint(20) NOT NULL,
`source_sdk` varchar(40) NOT NULL,
`sn` varchar(64) NOT NULL,
`requested_from` date DEFAULT NULL,
`requested_to` date DEFAULT NULL,
`status` varchar(20) NOT NULL,
`pulled_count` int(11) NOT NULL DEFAULT 0,
`inserted_count` int(11) NOT NULL DEFAULT 0,
`error_message` text DEFAULT NULL,
`created_at` datetime NOT NULL DEFAULT current_timestamp(),
`finished_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

---

--
-- Struktur dari tabel `tb_scanlog_safe_events`
--

CREATE TABLE `tb_scanlog_safe_events` (
`id` bigint(20) NOT NULL,
`source_event_key` varchar(191) NOT NULL,
`source_sdk` varchar(40) NOT NULL,
`sn` varchar(64) NOT NULL,
`pin` varchar(32) NOT NULL,
`scan_at` datetime NOT NULL,
`scan_date` date NOT NULL,
`scan_time` time NOT NULL,
`verifymode` int(11) DEFAULT NULL,
`iomode` int(11) DEFAULT NULL,
`workcode` varchar(32) DEFAULT NULL,
`raw_payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`raw_payload`)),
`batch_id` bigint(20) DEFAULT NULL,
`imported_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

---

--
-- Struktur dari tabel `tb_schedule`
--

CREATE TABLE `tb_schedule` (
`id` int(11) NOT NULL,
`karyawan_id` int(11) NOT NULL,
`tanggal` date NOT NULL,
`shift_id` int(11) NOT NULL,
`catatan` text DEFAULT NULL,
`created_at` timestamp NOT NULL DEFAULT current_timestamp(),
`updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

---

--
-- Struktur dari tabel `tb_schedule_revision_requests`
--

CREATE TABLE `tb_schedule_revision_requests` (
`id` int(11) NOT NULL,
`requester_karyawan_id` int(11) NOT NULL,
`group_id` int(11) NOT NULL,
`revision_type` enum('create','edit','delete') NOT NULL,
`payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`payload`)),
`status` enum('pending','approved','rejected') DEFAULT 'pending',
`reviewed_by_karyawan_id` int(11) DEFAULT NULL,
`reviewed_at` timestamp NULL DEFAULT NULL,
`review_note` text DEFAULT NULL,
`created_at` timestamp NOT NULL DEFAULT current_timestamp(),
`updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

---

--
-- Struktur dari tabel `tb_shift_type`
--

CREATE TABLE `tb_shift_type` (
`id` int(11) NOT NULL,
`nama_shift` varchar(50) NOT NULL,
`jam_masuk` time DEFAULT NULL,
`jam_keluar` time DEFAULT NULL,
`next_day` tinyint(1) NOT NULL DEFAULT 0,
`is_paid` tinyint(1) NOT NULL DEFAULT 1,
`jam_kerja` decimal(4,2) DEFAULT NULL,
`color_hex` varchar(7) DEFAULT '#6B7280',
`icon_key` varchar(30) DEFAULT NULL,
`needs_scan` tinyint(1) NOT NULL DEFAULT 1,
`is_active` tinyint(1) NOT NULL DEFAULT 1,
`created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

---

--
-- Struktur dari tabel `tb_template`
--

CREATE TABLE `tb_template` (
`sn` varchar(50) NOT NULL,
`pin` varchar(12) NOT NULL,
`finger_idx` int(11) NOT NULL,
`alg_ver` int(11) NOT NULL,
`template` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

---

--
-- Struktur dari tabel `tb_user`
--

CREATE TABLE `tb_user` (
`sn` varchar(50) NOT NULL,
`pin` varchar(12) NOT NULL,
`nama` text NOT NULL,
`pwd` text NOT NULL,
`rfid` text NOT NULL,
`privilege` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

---

--
-- Struktur dari tabel `tb_user_group_access`
--

CREATE TABLE `tb_user_group_access` (
`id` int(11) NOT NULL,
`pin` varchar(12) NOT NULL,
`group_id` int(11) NOT NULL,
`can_schedule` tinyint(1) NOT NULL DEFAULT 1,
`can_dashboard` tinyint(1) NOT NULL DEFAULT 1,
`is_leader` tinyint(1) NOT NULL DEFAULT 0 COMMENT '1 = group leader (can edit schedule), 0 = regular member (read-only)',
`is_approved` tinyint(1) NOT NULL DEFAULT 0,
`approved_by` varchar(12) DEFAULT NULL,
`approved_at` datetime DEFAULT NULL,
`created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

---

--
-- Struktur dari tabel `temp_scanlog`
--

CREATE TABLE `temp_scanlog` (
`sn` varchar(50) NOT NULL,
`pin` varchar(12) NOT NULL,
`scan_date` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
`verifymode` int(11) NOT NULL,
`iomode` int(11) NOT NULL,
`workcode` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

---

--
-- Struktur dari tabel `temp_template`
--

CREATE TABLE `temp_template` (
`sn` varchar(50) NOT NULL,
`pin` varchar(12) NOT NULL,
`finger_idx` int(11) NOT NULL,
`alg_ver` int(11) NOT NULL,
`template` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

---

--
-- Struktur dari tabel `temp_user`
--

CREATE TABLE `temp_user` (
`sn` varchar(50) NOT NULL,
`pin` varchar(12) NOT NULL,
`nama` text NOT NULL,
`pwd` text NOT NULL,
`rfid` text NOT NULL,
`privilege` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

---

--
-- Stand-in struktur untuk tampilan `vw_compat_karyawan_auth`
-- (Lihat di bawah untuk tampilan aktual)
--
CREATE TABLE `vw_compat_karyawan_auth` (
`karyawan_id` int(11)
,`nip` varchar(50)
,`password_hash` varchar(255)
,`is_active` int(1)
,`last_login_at` datetime
,`created_at` timestamp
,`updated_at` timestamp
);

---

--
-- Stand-in struktur untuk tampilan `vw_compat_karyawan_roles`
-- (Lihat di bawah untuk tampilan aktual)
--
CREATE TABLE `vw_compat_karyawan_roles` (
`id` int(2)
,`karyawan_id` int(11)
,`role_key` varchar(40)
,`group_id` int(11)
,`created_at` timestamp
);

---

--
-- Stand-in struktur untuk tampilan `vw_compat_scanlog_safe_events`
-- (Lihat di bawah untuk tampilan aktual)
--
CREATE TABLE `vw_compat_scanlog_safe_events` (
`id` bigint(20)
,`source_event_key` varchar(191)
,`source_sdk` varchar(14)
,`sn` varchar(64)
,`pin` varchar(32)
,`scan_at` datetime
,`scan_date` date
,`scan_time` time
,`verifymode` int(11)
,`iomode` int(11)
,`workcode` varchar(32)
,`raw_payload` longtext
,`batch_id` bigint(20)
,`imported_at` datetime
);

---

--
-- Stand-in struktur untuk tampilan `vw_compat_user_group_access`
-- (Lihat di bawah untuk tampilan aktual)
--
CREATE TABLE `vw_compat_user_group_access` (
`id` int(2)
,`pin` text
,`group_id` int(11)
,`can_schedule` int(1)
,`can_dashboard` int(1)
,`is_leader` int(1)
,`is_approved` int(1)
,`approved_by` varchar(12)
,`approved_at` timestamp
,`created_at` timestamp
);

---

--
-- Stand-in struktur untuk tampilan `vw_prediction_target_effective`
-- (Lihat di bawah untuk tampilan aktual)
--
CREATE TABLE `vw_prediction_target_effective` (
`year_month` char(7)
,`group_id` int(11)
,`nama_group` varchar(100)
,`minimum_hours` decimal(6,2)
,`target_source` varchar(15)
,`global_minimum_hours` decimal(6,2)
,`group_override_hours` decimal(6,2)
);

---

--
-- Struktur untuk view `vw_compat_karyawan_auth`
--
DROP TABLE IF EXISTS `vw_compat_karyawan_auth`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_compat_karyawan_auth` AS SELECT `ai`.`employee_id` AS `karyawan_id`, `ai`.`login_nip` AS `nip`, `ai`.`password_hash` AS `password_hash`, CASE WHEN `ai`.`identity_status` = 'active' THEN 1 ELSE 0 END AS `is_active`, `ai`.`last_login_at` AS `last_login_at`, `ai`.`created_at` AS `created_at`, `ai`.`updated_at` AS `updated_at` FROM `cs_employee_auth_identity` AS `ai` ;

---

--
-- Struktur untuk view `vw_compat_karyawan_roles`
--
DROP TABLE IF EXISTS `vw_compat_karyawan_roles`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_compat_karyawan_roles` AS SELECT cast(NULL as signed) AS `id`, `rb`.`employee_id` AS `karyawan_id`, `map`.`legacy_role_key` AS `role_key`, CASE WHEN `rb`.`scope_type` = 'group' THEN `rb`.`scope_group_id` ELSE NULL END AS `group_id`, `rb`.`created_at` AS `created_at` FROM (`cs_employee_role_bindings` `rb` join `cs_legacy_role_alias_map` `map` on(`map`.`canonical_role_key` = `rb`.`role_key` and `map`.`is_default_projection` = 1)) WHERE `rb`.`is_active` = 1 AND (`rb`.`ends_at` is null OR `rb`.`ends_at` >= current_timestamp()) ;

---

--
-- Struktur untuk view `vw_compat_scanlog_safe_events`
--
DROP TABLE IF EXISTS `vw_compat_scanlog_safe_events`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_compat_scanlog_safe_events` AS SELECT `re`.`id` AS `id`, `re`.`source_event_key` AS `source_event_key`, 'clean_slate_v3' AS `source_sdk`, `re`.`device_sn` AS `sn`, `re`.`employee_pin` AS `pin`, `re`.`event_at` AS `scan_at`, cast(`re`.`event_at` as date) AS `scan_date`, cast(`re`.`event_at` as time) AS `scan_time`, `re`.`verify_mode` AS `verifymode`, `re`.`io_mode` AS `iomode`, `re`.`workcode` AS `workcode`, `re`.`payload_json` AS `raw_payload`, `re`.`batch_ref` AS `batch_id`, `re`.`ingested_at` AS `imported_at` FROM `cs_scanlog_raw_events` AS `re` ;

---

--
-- Struktur untuk view `vw_compat_user_group_access`
--
DROP TABLE IF EXISTS `vw_compat_user_group_access`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_compat_user_group_access` AS SELECT cast(NULL as signed) AS `id`, `k`.`pin` AS `pin`, `rb`.`scope_group_id` AS `group_id`, CASE WHEN `rb`.`role_key` = 'group_leader' THEN 1 ELSE 0 END AS `can_schedule`, 1 AS `can_dashboard`, CASE WHEN `rb`.`role_key` = 'group_leader' THEN 1 ELSE 0 END AS `is_leader`, 1 AS `is_approved`, cast(NULL as char(12) charset utf8mb4) AS `approved_by`, `rb`.`created_at` AS `approved_at`, `rb`.`created_at` AS `created_at` FROM (`cs_employee_role_bindings` `rb` join `tb_karyawan` `k` on(`k`.`id` = `rb`.`employee_id`)) WHERE `rb`.`scope_type` = 'group' AND `rb`.`is_active` = 1 AND (`rb`.`ends_at` is null OR `rb`.`ends_at` >= current_timestamp()) ;

---

--
-- Struktur untuk view `vw_prediction_target_effective`
--
DROP TABLE IF EXISTS `vw_prediction_target_effective`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `vw_prediction_target_effective` AS SELECT `global_cfg`.`year_month` AS `year_month`, `grp`.`id` AS `group_id`, `grp`.`nama_group` AS `nama_group`, coalesce(`group_cfg`.`minimum_hours`,`global_cfg`.`minimum_hours`) AS `minimum_hours`, CASE WHEN `group_cfg`.`id` is null THEN 'global_fallback' ELSE 'group_override' END AS `target_source`, `global_cfg`.`minimum_hours` AS `global_minimum_hours`, `group_cfg`.`minimum_hours` AS `group_override_hours` FROM ((`cs_monthly_prediction_target_global` `global_cfg` join `tb_group` `grp` on(1 = 1)) left join `cs_monthly_prediction_target_group_override` `group_cfg` on(`group_cfg`.`year_month` = `global_cfg`.`year_month` and `group_cfg`.`group_id` = `grp`.`id` and `group_cfg`.`is_active` = 1)) WHERE `global_cfg`.`is_active` = 1union allselect `global_cfg`.`year_month` AS `year_month`,NULL AS `group_id`,NULL AS `nama_group`,`global_cfg`.`minimum_hours` AS `minimum_hours`,'global_default' AS `target_source`,`global_cfg`.`minimum_hours` AS `global_minimum_hours`,NULL AS `group_override_hours` from `cs_monthly_prediction_target_global` `global_cfg` where `global_cfg`.`is_active` = 1 ;

--
-- Indexes for dumped tables
--

--
-- Indeks untuk tabel `cs_attendance_daily_computed`
--
ALTER TABLE `cs_attendance_daily_computed`
ADD PRIMARY KEY (`id`),
ADD UNIQUE KEY `uq_cs_attendance_daily_employee_date` (`employee_id`,`work_date`),
ADD KEY `idx_cs_attendance_daily_date_status` (`work_date`,`computed_status`),
ADD KEY `fk_cs_attendance_daily_updated_by` (`updated_by_employee_id`);

--
-- Indeks untuk tabel `cs_employee_auth_identity`
--
ALTER TABLE `cs_employee_auth_identity`
ADD PRIMARY KEY (`employee_id`),
ADD UNIQUE KEY `uq_cs_employee_auth_identity_login_nip` (`login_nip`);

--
-- Indeks untuk tabel `cs_employee_identification_methods`
--
ALTER TABLE `cs_employee_identification_methods`
ADD PRIMARY KEY (`id`),
ADD UNIQUE KEY `uq_cs_ident_method_employee_type_value` (`employee_id`,`method_type`,`method_value`),
ADD KEY `idx_cs_ident_method_lookup` (`method_type`,`method_value`),
ADD KEY `idx_cs_ident_method_employee_primary` (`employee_id`,`is_primary`);

--
-- Indeks untuk tabel `cs_employee_role_bindings`
--
ALTER TABLE `cs_employee_role_bindings`
ADD PRIMARY KEY (`id`),
ADD UNIQUE KEY `uq_cs_role_binding_unique_scope` (`employee_id`,`role_key`,`scope_type`,`scope_group_id`,`starts_at`),
ADD KEY `idx_cs_role_binding_employee_active` (`employee_id`,`is_active`),
ADD KEY `idx_cs_role_binding_scope_group` (`scope_group_id`,`role_key`,`is_active`),
ADD KEY `fk_cs_role_binding_role` (`role_key`),
ADD KEY `fk_cs_role_binding_granted_by` (`granted_by_employee_id`);

--
-- Indeks untuk tabel `cs_group_ownership`
--
ALTER TABLE `cs_group_ownership`
ADD PRIMARY KEY (`id`),
ADD UNIQUE KEY `uq_cs_group_ownership_window` (`group_id`,`owner_employee_id`,`starts_at`),
ADD KEY `idx_cs_group_ownership_active_lookup` (`group_id`,`is_primary`,`ends_at`),
ADD KEY `fk_cs_group_ownership_owner` (`owner_employee_id`),
ADD KEY `fk_cs_group_ownership_assigned_by` (`assigned_by_employee_id`);

--
-- Indeks untuk tabel `cs_legacy_role_alias_map`
--
ALTER TABLE `cs_legacy_role_alias_map`
ADD PRIMARY KEY (`legacy_role_key`);

--
-- Indeks untuk tabel `cs_monthly_prediction_target_global`
--
ALTER TABLE `cs_monthly_prediction_target_global`
ADD PRIMARY KEY (`year_month`);

--
-- Indeks untuk tabel `cs_monthly_prediction_target_group_override`
--
ALTER TABLE `cs_monthly_prediction_target_group_override`
ADD PRIMARY KEY (`id`),
ADD UNIQUE KEY `uq_cs_monthly_prediction_group_override` (`year_month`,`group_id`),
ADD KEY `idx_cs_monthly_prediction_group_lookup` (`group_id`,`year_month`,`is_active`);

--
-- Indeks untuk tabel `cs_role_policy_catalog`
--
ALTER TABLE `cs_role_policy_catalog`
ADD PRIMARY KEY (`role_key`);

--
-- Indeks untuk tabel `cs_scanlog_raw_events`
--
ALTER TABLE `cs_scanlog_raw_events`
ADD PRIMARY KEY (`id`),
ADD UNIQUE KEY `uq_cs_scanlog_raw_source_event` (`source_event_key`),
ADD KEY `idx_cs_scanlog_raw_device_time` (`device_sn`,`event_at`),
ADD KEY `idx_cs_scanlog_raw_pin_time` (`employee_pin`,`event_at`);

--
-- Indeks untuk tabel `employees`
--
ALTER TABLE `employees`
ADD PRIMARY KEY (`id`),
ADD UNIQUE KEY `employee_code` (`employee_code`);

--
-- Indeks untuk tabel `employee_auth_accounts`
--
ALTER TABLE `employee_auth_accounts`
ADD PRIMARY KEY (`id`),
ADD UNIQUE KEY `username` (`username`),
ADD KEY `fk_emp_auth_emp` (`employee_id`);

--
-- Indeks untuk tabel `employee_machine_identity`
--
ALTER TABLE `employee_machine_identity`
ADD PRIMARY KEY (`id`),
ADD UNIQUE KEY `uq_machine_identity` (`device_sn`,`pin`,`valid_from`),
ADD KEY `fk_machine_identity_emp` (`employee_id`);

--
-- Indeks untuk tabel `scanlog_events`
--
ALTER TABLE `scanlog_events`
ADD PRIMARY KEY (`id`),
ADD UNIQUE KEY `source_event_key` (`source_event_key`),
ADD KEY `idx_scanlog_device_time` (`device_sn`,`event_time`,`id`),
ADD KEY `idx_scanlog_pin_time` (`pin_raw`,`event_time`,`id`);

--
-- Indeks untuk tabel `tb_attendance_note`
--
ALTER TABLE `tb_attendance_note`
ADD PRIMARY KEY (`id`),
ADD UNIQUE KEY `uq_note` (`pin`,`tanggal`);

--
-- Indeks untuk tabel `tb_device`
--
ALTER TABLE `tb_device`
ADD PRIMARY KEY (`No`);

--
-- Indeks untuk tabel `tb_employee_group`
--
ALTER TABLE `tb_employee_group`
ADD PRIMARY KEY (`karyawan_id`),
ADD KEY `fk_eg_group` (`group_id`);

--
-- Indeks untuk tabel `tb_group`
--
ALTER TABLE `tb_group`
ADD PRIMARY KEY (`id`);

--
-- Indeks untuk tabel `tb_group_schedule`
--
ALTER TABLE `tb_group_schedule`
ADD PRIMARY KEY (`id`),
ADD KEY `fk_gs_group` (`group_id`),
ADD KEY `fk_gs_shift` (`shift_id`);

--
-- Indeks untuk tabel `tb_karyawan`
--
ALTER TABLE `tb_karyawan`
ADD PRIMARY KEY (`id`);

--
-- Indeks untuk tabel `tb_karyawan_auth`
--
ALTER TABLE `tb_karyawan_auth`
ADD PRIMARY KEY (`karyawan_id`),
ADD UNIQUE KEY `nip` (`nip`);

--
-- Indeks untuk tabel `tb_karyawan_roles`
--
ALTER TABLE `tb_karyawan_roles`
ADD PRIMARY KEY (`id`),
ADD KEY `karyawan_id` (`karyawan_id`);

--
-- Indeks untuk tabel `tb_scanlog`
--
ALTER TABLE `tb_scanlog`
ADD KEY `idx_usr_scandate` (`scan_date`,`pin`,`sn`);

--
-- Indeks untuk tabel `tb_scanlog_hidden`
--
ALTER TABLE `tb_scanlog_hidden`
ADD PRIMARY KEY (`id`),
ADD UNIQUE KEY `uq_scan_hidden` (`pin`,`scan_at`,`sn`,`iomode`,`workcode`),
ADD KEY `idx_scan_hidden_pin_date` (`pin`,`scan_at`);

--
-- Indeks untuk tabel `tb_scanlog_review_mutation_audit`
--
ALTER TABLE `tb_scanlog_review_mutation_audit`
ADD PRIMARY KEY (`id`),
ADD KEY `idx_review_mutation_lookup` (`pin`,`scan_at`,`sn`,`iomode`,`workcode`),
ADD KEY `idx_review_mutation_action_time` (`action`,`acted_at`);

--
-- Indeks untuk tabel `tb_scanlog_review_tag`
--
ALTER TABLE `tb_scanlog_review_tag`
ADD PRIMARY KEY (`pin`,`scan_at`,`sn`,`iomode`,`workcode`);

--
-- Indeks untuk tabel `tb_scanlog_safe_batches`
--
ALTER TABLE `tb_scanlog_safe_batches`
ADD PRIMARY KEY (`id`),
ADD KEY `idx_safe_batch_sn_created` (`sn`,`created_at`);

--
-- Indeks untuk tabel `tb_scanlog_safe_events`
--
ALTER TABLE `tb_scanlog_safe_events`
ADD PRIMARY KEY (`id`),
ADD UNIQUE KEY `uq_safe_source_event` (`source_event_key`),
ADD KEY `idx_safe_sn_scanat` (`sn`,`scan_at`),
ADD KEY `idx_safe_pin_scanat` (`pin`,`scan_at`),
ADD KEY `idx_safe_date_pin` (`scan_date`,`pin`),
ADD KEY `idx_safe_batch` (`batch_id`);

--
-- Indeks untuk tabel `tb_schedule`
--
ALTER TABLE `tb_schedule`
ADD PRIMARY KEY (`id`),
ADD UNIQUE KEY `uq_sched` (`karyawan_id`,`tanggal`),
ADD KEY `fk_sched_shift` (`shift_id`);

--
-- Indeks untuk tabel `tb_schedule_revision_requests`
--
ALTER TABLE `tb_schedule_revision_requests`
ADD PRIMARY KEY (`id`),
ADD KEY `requester_karyawan_id` (`requester_karyawan_id`),
ADD KEY `reviewed_by_karyawan_id` (`reviewed_by_karyawan_id`);

--
-- Indeks untuk tabel `tb_shift_type`
--
ALTER TABLE `tb_shift_type`
ADD PRIMARY KEY (`id`);

--
-- Indeks untuk tabel `tb_template`
--
ALTER TABLE `tb_template`
ADD KEY `fk_composite_key` (`pin`,`sn`);

--
-- Indeks untuk tabel `tb_user`
--
ALTER TABLE `tb_user`
ADD PRIMARY KEY (`pin`,`sn`) USING BTREE;

--
-- Indeks untuk tabel `tb_user_group_access`
--
ALTER TABLE `tb_user_group_access`
ADD PRIMARY KEY (`id`),
ADD UNIQUE KEY `uq_user_group_access` (`pin`,`group_id`),
ADD KEY `idx_user_group_pin` (`pin`),
ADD KEY `idx_user_group_group` (`group_id`);

--
-- AUTO_INCREMENT untuk tabel yang dibuang
--

--
-- AUTO_INCREMENT untuk tabel `cs_attendance_daily_computed`
--
ALTER TABLE `cs_attendance_daily_computed`
MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `cs_employee_identification_methods`
--
ALTER TABLE `cs_employee_identification_methods`
MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `cs_employee_role_bindings`
--
ALTER TABLE `cs_employee_role_bindings`
MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `cs_group_ownership`
--
ALTER TABLE `cs_group_ownership`
MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `cs_monthly_prediction_target_group_override`
--
ALTER TABLE `cs_monthly_prediction_target_group_override`
MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `cs_scanlog_raw_events`
--
ALTER TABLE `cs_scanlog_raw_events`
MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `employees`
--
ALTER TABLE `employees`
MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `employee_auth_accounts`
--
ALTER TABLE `employee_auth_accounts`
MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `employee_machine_identity`
--
ALTER TABLE `employee_machine_identity`
MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `scanlog_events`
--
ALTER TABLE `scanlog_events`
MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `tb_attendance_note`
--
ALTER TABLE `tb_attendance_note`
MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `tb_device`
--
ALTER TABLE `tb_device`
MODIFY `No` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `tb_group`
--
ALTER TABLE `tb_group`
MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `tb_group_schedule`
--
ALTER TABLE `tb_group_schedule`
MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `tb_karyawan`
--
ALTER TABLE `tb_karyawan`
MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `tb_karyawan_roles`
--
ALTER TABLE `tb_karyawan_roles`
MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `tb_scanlog_hidden`
--
ALTER TABLE `tb_scanlog_hidden`
MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `tb_scanlog_review_mutation_audit`
--
ALTER TABLE `tb_scanlog_review_mutation_audit`
MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `tb_scanlog_safe_batches`
--
ALTER TABLE `tb_scanlog_safe_batches`
MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `tb_scanlog_safe_events`
--
ALTER TABLE `tb_scanlog_safe_events`
MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `tb_schedule`
--
ALTER TABLE `tb_schedule`
MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `tb_schedule_revision_requests`
--
ALTER TABLE `tb_schedule_revision_requests`
MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `tb_shift_type`
--
ALTER TABLE `tb_shift_type`
MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT untuk tabel `tb_user_group_access`
--
ALTER TABLE `tb_user_group_access`
MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- Ketidakleluasaan untuk tabel pelimpahan (Dumped Tables)
--

--
-- Ketidakleluasaan untuk tabel `cs_attendance_daily_computed`
--
ALTER TABLE `cs_attendance_daily_computed`
ADD CONSTRAINT `fk_cs_attendance_daily_employee` FOREIGN KEY (`employee_id`) REFERENCES `tb_karyawan` (`id`) ON DELETE CASCADE,
ADD CONSTRAINT `fk_cs_attendance_daily_updated_by` FOREIGN KEY (`updated_by_employee_id`) REFERENCES `tb_karyawan` (`id`) ON DELETE SET NULL;

--
-- Ketidakleluasaan untuk tabel `cs_employee_auth_identity`
--
ALTER TABLE `cs_employee_auth_identity`
ADD CONSTRAINT `fk_cs_employee_auth_identity_employee` FOREIGN KEY (`employee_id`) REFERENCES `tb_karyawan` (`id`) ON DELETE CASCADE;

--
-- Ketidakleluasaan untuk tabel `cs_employee_identification_methods`
--
ALTER TABLE `cs_employee_identification_methods`
ADD CONSTRAINT `fk_cs_ident_method_employee` FOREIGN KEY (`employee_id`) REFERENCES `tb_karyawan` (`id`) ON DELETE CASCADE;

--
-- Ketidakleluasaan untuk tabel `cs_employee_role_bindings`
--
ALTER TABLE `cs_employee_role_bindings`
ADD CONSTRAINT `fk_cs_role_binding_employee` FOREIGN KEY (`employee_id`) REFERENCES `tb_karyawan` (`id`) ON DELETE CASCADE,
ADD CONSTRAINT `fk_cs_role_binding_granted_by` FOREIGN KEY (`granted_by_employee_id`) REFERENCES `tb_karyawan` (`id`) ON DELETE SET NULL,
ADD CONSTRAINT `fk_cs_role_binding_role` FOREIGN KEY (`role_key`) REFERENCES `cs_role_policy_catalog` (`role_key`),
ADD CONSTRAINT `fk_cs_role_binding_scope_group` FOREIGN KEY (`scope_group_id`) REFERENCES `tb_group` (`id`) ON DELETE SET NULL;

--
-- Ketidakleluasaan untuk tabel `cs_group_ownership`
--
ALTER TABLE `cs_group_ownership`
ADD CONSTRAINT `fk_cs_group_ownership_assigned_by` FOREIGN KEY (`assigned_by_employee_id`) REFERENCES `tb_karyawan` (`id`) ON DELETE SET NULL,
ADD CONSTRAINT `fk_cs_group_ownership_group` FOREIGN KEY (`group_id`) REFERENCES `tb_group` (`id`) ON DELETE CASCADE,
ADD CONSTRAINT `fk_cs_group_ownership_owner` FOREIGN KEY (`owner_employee_id`) REFERENCES `tb_karyawan` (`id`) ON DELETE CASCADE;

--
-- Ketidakleluasaan untuk tabel `cs_monthly_prediction_target_group_override`
--
ALTER TABLE `cs_monthly_prediction_target_group_override`
ADD CONSTRAINT `fk_cs_monthly_prediction_global_month` FOREIGN KEY (`year_month`) REFERENCES `cs_monthly_prediction_target_global` (`year_month`) ON DELETE CASCADE,
ADD CONSTRAINT `fk_cs_monthly_prediction_group` FOREIGN KEY (`group_id`) REFERENCES `tb_group` (`id`) ON DELETE CASCADE;

--
-- Ketidakleluasaan untuk tabel `employee_auth_accounts`
--
ALTER TABLE `employee_auth_accounts`
ADD CONSTRAINT `fk_emp_auth_emp` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`);

--
-- Ketidakleluasaan untuk tabel `employee_machine_identity`
--
ALTER TABLE `employee_machine_identity`
ADD CONSTRAINT `fk_machine_identity_emp` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`);

--
-- Ketidakleluasaan untuk tabel `tb_karyawan_auth`
--
ALTER TABLE `tb_karyawan_auth`
ADD CONSTRAINT `tb_karyawan_auth_ibfk_1` FOREIGN KEY (`karyawan_id`) REFERENCES `tb_karyawan` (`id`) ON DELETE CASCADE;

--
-- Ketidakleluasaan untuk tabel `tb_karyawan_roles`
--
ALTER TABLE `tb_karyawan_roles`
ADD CONSTRAINT `tb_karyawan_roles_ibfk_1` FOREIGN KEY (`karyawan_id`) REFERENCES `tb_karyawan` (`id`) ON DELETE CASCADE;

--
-- Ketidakleluasaan untuk tabel `tb_scanlog_safe_events`
--
ALTER TABLE `tb_scanlog_safe_events`
ADD CONSTRAINT `fk_safe_batch` FOREIGN KEY (`batch_id`) REFERENCES `tb_scanlog_safe_batches` (`id`) ON DELETE SET NULL;

--
-- Ketidakleluasaan untuk tabel `tb_schedule_revision_requests`
--
ALTER TABLE `tb_schedule_revision_requests`
ADD CONSTRAINT `tb_schedule_revision_requests_ibfk_1` FOREIGN KEY (`requester_karyawan_id`) REFERENCES `tb_karyawan` (`id`),
ADD CONSTRAINT `tb_schedule_revision_requests_ibfk_2` FOREIGN KEY (`reviewed_by_karyawan_id`) REFERENCES `tb_karyawan` (`id`);

--
-- Ketidakleluasaan untuk tabel `tb_template`
--
ALTER TABLE `tb_template`
ADD CONSTRAINT `fk_composite_key` FOREIGN KEY (`pin`,`sn`) REFERENCES `tb_user` (`pin`, `sn`) ON DELETE CASCADE;
COMMIT;

/_!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT _/;
/_!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS _/;
/_!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION _/;
