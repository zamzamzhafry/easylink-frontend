-- Async Job Tracking for Control Panel
-- Database: demo_easylinksdk (same DB the control panel already uses)
-- Purpose: non-blocking UX for sync_scanlogs / sync_users / hop_b_push
--          spawn-and-poll pattern. Web server spawns worker.php via
--          `cmd /C start /B`, then JS polls ?action=job_status.

USE demo_easylinksdk;

CREATE TABLE IF NOT EXISTS fservice_jobs (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  job_id        VARCHAR(64)  NOT NULL,
  type          VARCHAR(32)  NOT NULL COMMENT 'sync_scanlogs | sync_users | hop_b_push',
  payload       LONGTEXT     NULL     COMMENT 'JSON args (machine_id, full, etc)',
  status        ENUM('pending','running','done','error') NOT NULL DEFAULT 'pending',
  progress      INT NOT NULL DEFAULT 0  COMMENT 'rows processed so far (live counter for worker)',
  result        LONGTEXT     NULL     COMMENT 'JSON final result {ok, synced, errors[]}',
  last_error    TEXT         NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at    DATETIME     NULL,
  finished_at   DATETIME     NULL,
  UNIQUE KEY uq_job_id (job_id),
  KEY idx_job_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
