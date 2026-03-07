USE `demo_easylinksdk`;

ALTER TABLE `tb_shift_type`
  ADD COLUMN IF NOT EXISTS `icon_key` VARCHAR(30) NULL DEFAULT NULL AFTER `color_hex`,
  ADD COLUMN IF NOT EXISTS `is_active` TINYINT(1) NOT NULL DEFAULT 1 AFTER `needs_scan`;

CREATE TABLE IF NOT EXISTS `tb_user_group_access` (
  `id`            INT(11)      NOT NULL AUTO_INCREMENT,
  `pin`           VARCHAR(12)  NOT NULL,
  `group_id`      INT(11)      NOT NULL,
  `can_schedule`  TINYINT(1)   NOT NULL DEFAULT 1,
  `can_dashboard` TINYINT(1)   NOT NULL DEFAULT 1,
  `is_approved`   TINYINT(1)   NOT NULL DEFAULT 0,
  `approved_by`   VARCHAR(12)  DEFAULT NULL,
  `approved_at`   DATETIME     DEFAULT NULL,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_group_access` (`pin`, `group_id`),
  KEY `idx_user_group_pin` (`pin`),
  KEY `idx_user_group_group` (`group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

