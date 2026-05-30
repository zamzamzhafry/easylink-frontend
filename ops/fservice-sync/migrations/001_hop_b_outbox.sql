-- HOP B Windows Outbox Schema
-- Database: easylink_bridge (local Windows MySQL/MariaDB)
-- Purpose: durable local staging for scanlog batches before HTTP push to Linux VM

CREATE DATABASE IF NOT EXISTS easylink_bridge;
USE easylink_bridge;

-- Tracks per-device fetch checkpoint from FService
CREATE TABLE IF NOT EXISTS fetch_checkpoint (
  sn VARCHAR(64) NOT NULL PRIMARY KEY,
  last_fetch_at DATETIME NULL,
  last_scan_date VARCHAR(20) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Raw scanlog rows staged from FService before batching
CREATE TABLE IF NOT EXISTS raw_scanlog_staging (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sn VARCHAR(64) NOT NULL,
  scan_date VARCHAR(20) NOT NULL,
  scan_time VARCHAR(10) NOT NULL DEFAULT '',
  pin VARCHAR(32) NOT NULL,
  verifymode INT NOT NULL DEFAULT 0,
  iomode INT NOT NULL DEFAULT 0,
  workcode INT NOT NULL DEFAULT 0,
  source_event_key VARCHAR(255) NOT NULL,
  fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  batch_id VARCHAR(64) NULL,
  UNIQUE KEY uq_staging_event (source_event_key),
  KEY idx_staging_unbatched (batch_id, fetched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Outbox: one row per batch sent to Linux VM
CREATE TABLE IF NOT EXISTS sync_batch (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  batch_id VARCHAR(64) NOT NULL UNIQUE,
  device_sn VARCHAR(64) NOT NULL,
  status ENUM('pending','sending','sent','failed','dead_letter') NOT NULL DEFAULT 'pending',
  record_count INT UNSIGNED NOT NULL DEFAULT 0,
  payload_hash VARCHAR(64) NULL COMMENT 'SHA-256 of serialized payload for replay detection',
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts INT UNSIGNED NOT NULL DEFAULT 5,
  last_attempt_at DATETIME NULL,
  next_retry_at DATETIME NULL,
  last_error TEXT NULL,
  last_error_class VARCHAR(32) NULL,
  last_error_code VARCHAR(64) NULL,
  last_error_retryable TINYINT(1) NULL,
  last_error_at DATETIME NULL,
  http_status_code INT NULL,
  last_response_body TEXT NULL,
  ack_status VARCHAR(32) NULL,
  ack_inserted_count INT NULL,
  ack_duplicate_count INT NULL,
  ack_committed_at DATETIME NULL,
  ack_request_id VARCHAR(64) NULL,
  ack_response_body TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  KEY idx_batch_status (status, next_retry_at),
  KEY idx_batch_device (device_sn, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Links staging rows to their batch
CREATE TABLE IF NOT EXISTS sync_batch_item (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  batch_id VARCHAR(64) NOT NULL,
  staging_id BIGINT UNSIGNED NOT NULL,
  source_event_key VARCHAR(255) NOT NULL,
  KEY idx_item_batch (batch_id),
  CONSTRAINT fk_item_staging FOREIGN KEY (staging_id) REFERENCES raw_scanlog_staging(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
