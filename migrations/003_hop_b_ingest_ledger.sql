-- HOP B Ingest Ledger for Linux VM
-- Extends existing tb_scanlog_safe_batches/events for Windows push tracking
-- Existing tables from migration_scanlog_safe_events.sql are prerequisites

-- Track inbound HOP B batch requests
CREATE TABLE IF NOT EXISTS tb_hop_b_ingest_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  batch_id VARCHAR(64) NOT NULL,
  source_sdk VARCHAR(32) NOT NULL DEFAULT 'fservice-hop-b',
  device_sn VARCHAR(64) NOT NULL,
  record_count INT UNSIGNED NOT NULL DEFAULT 0,
  inserted_count INT UNSIGNED NOT NULL DEFAULT 0,
  duplicate_count INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('received','processing','committed','failed') NOT NULL DEFAULT 'received',
  payload_hash VARCHAR(64) NULL COMMENT 'SHA-256 for replay detection',
  error_message TEXT NULL,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  committed_at DATETIME NULL,
  UNIQUE KEY uq_hop_b_batch (batch_id),
  KEY idx_hop_b_device (device_sn, received_at),
  KEY idx_hop_b_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Note: Individual scanlog records are inserted into existing tb_scanlog_safe_events
-- using INSERT IGNORE on source_event_key unique constraint (uq_safe_source_event)
-- The batch_id FK in tb_scanlog_safe_events links records to their originating batch
-- For HOP B records, source_sdk = 'fservice-hop-b'
-- Durable commit boundary: transaction commits BOTH tb_scanlog_safe_events inserts
-- AND tb_hop_b_ingest_log status='committed' update before ack is returned
