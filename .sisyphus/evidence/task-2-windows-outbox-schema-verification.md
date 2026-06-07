# task-2-windows-outbox-schema-verification

## Goal
Define targeted verification path for Windows local durable outbox schema/state model.
This file is evidence placeholder for later execution (manual or scripted).

## Preconditions
- Windows machine has local MySQL/MariaDB running.
- Local DB created: `easylink_bridge`.
- Schema applied from: `ops/fservice-sync/windows-bridge-outbox-schema.sql`.

## Verification steps (targeted)

### 1) Schema existence / columns
Run (examples):

```bash
mysql -u root easylink_bridge -e "SHOW TABLES;"
mysql -u root easylink_bridge -e "DESCRIBE raw_scanlog_staging;"
mysql -u root easylink_bridge -e "DESCRIBE sync_batch;"
mysql -u root easylink_bridge -e "DESCRIBE sync_batch_item;"
mysql -u root easylink_bridge -e "DESCRIBE fetch_checkpoint;"
```

Expected:
- tables exist: `fetch_checkpoint`, `raw_scanlog_staging`, `sync_batch`, `sync_batch_item` (plus optional `device_registry`).
- raw_scanlog_staging has: `sync_status`, `sync_attempts`, `next_retry_at`, `last_error`, `linux_ack_at`, `linux_ack_id`.

### 2) Minimal state transitions
Insert fake pending row:

```sql
INSERT INTO raw_scanlog_staging (
  device_sn, vendor_log_id, machine_user_id, scan_time, io_mode, raw_payload_json
) VALUES (
  'TEST_SN', 'V1', 'PIN123', NOW(), '0', JSON_OBJECT('example', true)
);
```

Move pending -> sending (simulate worker lock):

```sql
UPDATE raw_scanlog_staging
SET sync_status='sending', sync_attempts=sync_attempts+1, last_sync_attempt_at=NOW()
WHERE device_sn='TEST_SN' AND vendor_log_id='V1' AND sync_status='pending';
```

Attempt to mark sent MUST include linux ack fields (app logic requirement):

```sql
UPDATE raw_scanlog_staging
SET sync_status='sent', sent_at=NOW(), linux_ack_at=NOW(), linux_ack_id='ACK1', linux_ack_json=JSON_OBJECT('ok', true)
WHERE device_sn='TEST_SN' AND vendor_log_id='V1' AND sync_status='sending';
```

Fail path sending -> failed with retry metadata:

```sql
UPDATE raw_scanlog_staging
SET sync_status='failed', last_error='VM timeout', last_error_at=NOW(), next_retry_at=DATE_ADD(NOW(), INTERVAL 5 MINUTE)
WHERE device_sn='TEST_SN' AND vendor_log_id='V1' AND sync_status IN ('pending','sending');
```

Requeue failed -> pending:

```sql
UPDATE raw_scanlog_staging
SET sync_status='pending', next_retry_at=NULL
WHERE device_sn='TEST_SN' AND vendor_log_id='V1' AND sync_status='failed';
```

Expected:
- transitions possible via SQL updates.
- `sent` update contains `linux_ack_at` + `linux_ack_id` (enforced by worker, not DB constraint).

### 3) Batch bookkeeping
Create batch, attach item:

```sql
INSERT INTO sync_batch (batch_uuid, status, rows_selected) VALUES (UUID(), 'running', 1);
SET @batch_id = LAST_INSERT_ID();
SET @staging_id = (SELECT id FROM raw_scanlog_staging WHERE device_sn='TEST_SN' AND vendor_log_id='V1' LIMIT 1);
INSERT INTO sync_batch_item (batch_id, staging_id, item_status) VALUES (@batch_id, @staging_id, 'selected');
```

Expected:
- FK cascade works (deleting batch deletes items).

## Notes
- DB cannot enforce "sent only after linux ack" without triggers; keep in worker logic.
- Idempotency: unique keys on (device_sn, vendor_log_id) and fallback natural key reduce local dupes; Linux ingest still must dedupe.
