CREATE TABLE IF NOT EXISTS machine_user_poll_checkpoints (
  job_key VARCHAR(128) NOT NULL PRIMARY KEY,
  source_sdk VARCHAR(64) NOT NULL DEFAULT 'unknown',
  status ENUM('running', 'completed', 'failed') NOT NULL DEFAULT 'running',
  last_cursor VARCHAR(255) NULL,
  last_page INT UNSIGNED NULL,
  pulled_count INT UNSIGNED NOT NULL DEFAULT 0,
  inserted_count INT UNSIGNED NOT NULL DEFAULT 0,
  updated_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS machine_user_poll_chunks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_key VARCHAR(128) NOT NULL,
  chunk_index INT UNSIGNED NOT NULL,
  cursor VARCHAR(255) NULL,
  raw_payload JSON NOT NULL,
  status ENUM('pending', 'processed', 'failed') NOT NULL DEFAULT 'pending',
  validation_errors TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  KEY idx_machine_user_poll_chunks_job_key (job_key)
);
