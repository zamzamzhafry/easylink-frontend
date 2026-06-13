-- Backfill easylink_bridge.raw_scanlog_staging from demo_easylinksdk.tb_scanlog
--
-- This bridges the gap so the existing 64K+ rows in tb_scanlog become
-- visible to the Hop B worker (hop-b-batch-selector.php), which reads
-- from raw_scanlog_staging.
--
-- Idempotent: INSERT IGNORE on UNIQUE(source_event_key).
-- Safe to re-run.
--
-- demo_easylinksdk.tb_scanlog schema (legacy):
--   sn VARCHAR(50), pin VARCHAR(12), scan_date TIMESTAMP,
--   verifymode INT, iomode INT, workcode INT
--
-- easylink_bridge.raw_scanlog_staging:
--   id PK auto, sn, scan_date VARCHAR(20), scan_time VARCHAR(10),
--   pin, verifymode, iomode, workcode, source_event_key UNIQUE,
--   fetched_at, batch_id
--
-- source_event_key formula (must match hop-b-batch-selector contract):
--   sn|YYYY-MM-DD|HH:MM:SS|pin|verifymode|iomode|workcode

INSERT IGNORE INTO easylink_bridge.raw_scanlog_staging
  (sn, scan_date, scan_time, pin, verifymode, iomode, workcode,
   source_event_key, fetched_at)
SELECT
  s.sn,
  DATE_FORMAT(s.scan_date, '%Y-%m-%d')                                   AS scan_date,
  DATE_FORMAT(s.scan_date, '%H:%i:%s')                                   AS scan_time,
  s.pin,
  s.verifymode,
  s.iomode,
  s.workcode,
  CONCAT(s.sn, '|',
         DATE_FORMAT(s.scan_date, '%Y-%m-%d'), '|',
         DATE_FORMAT(s.scan_date, '%H:%i:%s'), '|',
         s.pin, '|',
         s.verifymode, '|',
         s.iomode, '|',
         s.workcode)                                                     AS source_event_key,
  s.scan_date                                                            AS fetched_at
FROM demo_easylinksdk.tb_scanlog s;

-- Verify (run separately):
--   SELECT COUNT(*) FROM easylink_bridge.raw_scanlog_staging;
--   SELECT COUNT(*) FROM easylink_bridge.raw_scanlog_staging r
--     LEFT JOIN easylink_bridge.sync_batch_item i ON i.staging_id = r.id
--     WHERE i.staging_id IS NULL;   -- should be ~64K for fresh backfill
