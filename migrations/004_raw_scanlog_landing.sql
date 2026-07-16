-- Raw scanlog landing zone (Option A: dump-raw-then-app-cleans)
--
-- The fetcher returns device rows VERBATIM. This table stores them untransformed
-- so the raw device payload is never lost. A clean pass (lib/scanlog-clean-pass.js)
-- reads pending rows, validates/splits/dedups, and writes survivors to
-- tb_scanlog_safe_events. Raw rows stay here forever = replayable source of truth.
--
-- natural_key = device_sn|<raw ScanDate>|PIN|IOMode — cheap landing-level dedup so
-- re-pulling the same window does not re-insert. This is INTENTIONALLY looser than
-- the safe_events source_event_key (which needs split date/time); landing dedup only
-- guards against duplicate raw pulls, the clean pass owns canonical dedup.

CREATE TABLE IF NOT EXISTS tb_raw_scanlog (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  device_sn      VARCHAR(64)  NOT NULL COMMENT 'Source device serial (from pull request sn)',
  natural_key    VARCHAR(255) NOT NULL COMMENT 'device_sn|ScanDate|PIN|IOMode — landing dedup',
  raw_json       JSON         NOT NULL COMMENT 'Verbatim device row as returned by fetcher',
  process_status ENUM('pending','clean','invalid') NOT NULL DEFAULT 'pending',
  process_error  VARCHAR(255) NULL COMMENT 'Reason when process_status=invalid',
  fetched_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at   DATETIME     NULL,
  UNIQUE KEY uq_raw_scanlog_natural (natural_key),
  KEY idx_raw_scanlog_status (process_status),
  KEY idx_raw_scanlog_device (device_sn, fetched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Immutable raw scanlog landing zone; clean pass derives tb_scanlog_safe_events';
