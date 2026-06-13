# HOP B Outbox Migrations

Local Windows MySQL/MariaDB schema for the scanlog sync outbox pattern.

## Apply order (fresh install)

```cmd
:: Step 1: outbox schema (creates easylink_bridge DB)
mysql -u root < ops\fservice-sync\migrations\001_hop_b_outbox.sql

:: Step 2: async job tracking (in demo_easylinksdk)
mysql -u root < ops\fservice-sync\migrations\002_fservice_jobs.sql

:: Step 3 (one-time): backfill existing tb_scanlog rows into raw_scanlog_staging
mysql -u root < ops\fservice-sync\migrations\003_backfill_staging.sql
```

After step 3, verify:
```sql
SELECT COUNT(*) FROM easylink_bridge.raw_scanlog_staging;        -- should match tb_scanlog
SELECT COUNT(*) FROM easylink_bridge.raw_scanlog_staging r
  LEFT JOIN easylink_bridge.sync_batch_item i ON i.staging_id = r.id
  WHERE i.staging_id IS NULL;                                    -- pending push count
```

## 001_hop_b_outbox.sql

Creates `easylink_bridge` database with four tables:

| Table | Purpose |
|---|---|
| `fetch_checkpoint` | Per-device cursor tracking last FService fetch position |
| `raw_scanlog_staging` | Individual scan rows staged before batching, deduped by `source_event_key` |
| `sync_batch` | Outbox — one row per batch pushed to Linux VM |
| `sync_batch_item` | Links staging rows to their parent batch |

## Batch State Machine

```
pending → sending → sent
                  ↘ failed → (retry) → sending
                           ↘ dead_letter
```

| State | Meaning |
|---|---|
| `pending` | Batch created, not yet attempted |
| `sending` | HTTP POST in flight |
| `sent` | Linux ack received (HTTP 200 + `status:accepted`); ONLY then mark sent |
| `failed` | Attempt failed, will retry up to `max_attempts` with exponential backoff |
| `dead_letter` | Max retries exhausted, requires operator intervention |

## source_event_key

Formula: `sn|scan_date|scan_time|pin|verifymode|iomode|workcode`

Computed on staging insert for early deduplication before batching.

## 002_fservice_jobs.sql

Creates `fservice_jobs` in **`demo_easylinksdk`** (the same DB the control panel
uses). Tracks async worker jobs spawned by the control panel:

| Column | Purpose |
|---|---|
| `job_id` | UUID-style external handle (`job_xxxxxxxxxxxxxxxx`) returned to JS |
| `type` | `sync_scanlogs` \| `sync_users` \| `hop_b_push` |
| `payload` | JSON args (machine_id, full, etc.) |
| `status` | `pending` \| `running` \| `done` \| `error` |
| `progress` | live row counter updated by worker |
| `result` | JSON final result (synced count, errors, batches sent) |

The control panel spawns `worker.php <job_id>` via
`cmd /C start /B` (Windows) and immediately returns the `job_id`. JS polls
`?action=job_status` every 1.5 s for terminal state.

## 003_backfill_staging.sql

One-time migration to push the 64K+ existing `demo_easylinksdk.tb_scanlog` rows
into `easylink_bridge.raw_scanlog_staging` so the Hop B worker can drain them
to the VM. Idempotent (`INSERT IGNORE` on `UNIQUE(source_event_key)`).

After this runs once, the regular sync flow (panel button or `sync.php`) dual
writes new rows to both DBs going forward, so this never needs to be re-run
unless you wipe `easylink_bridge`.
